import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { getAIProvider } from '@/lib/ai/provider';
import { getToneForNace } from '@/lib/ai/tone';
import { generateOutreachPrompt, type OutreachContext } from '@/lib/ai/prompts';
import { sanitizeVariant } from '@/lib/ai/sanitize';
import { logAIUsage } from '@/lib/ai/cost-tracker';
import { ITEMS_PER_PAGE } from '@/lib/constants';
import { alreadyContactedRecently } from '@/lib/dedup';
import { ACTIVE_DEAL_STAGES, type PipelineStage } from '@/lib/pipeline-logic';
import { assignVariantForLead } from '@/lib/ai/variant-assignment';
import { DEFAULT_CADENCE_EXPERIMENT_ID } from '@/lib/sequence-cadence';

// Pro plan: ruim genoeg voor 25 sequentiële AI calls
export const maxDuration = 300;

const batchSchema = z.object({
  businessIds: z.array(z.string().uuid()).min(1).max(ITEMS_PER_PAGE),
  channel: z.enum(['email', 'phone']),
  templateStyle: z.string().optional(),
  // Fase 1: optional experiment id voor A/B variant-assignment.
  // Indien afwezig → fallback naar Default Cadence experiment (altijd 'control').
  experimentId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  if (!(await isValidSession(request))) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }

  const { allowed } = rateLimit('ai-batch', 3, 3_600_000); // 3 per uur
  if (!allowed) {
    return NextResponse.json({ error: 'Te veel batch verzoeken. Probeer het later opnieuw.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validatie mislukt', details: parsed.error.flatten() }, { status: 400 });
    }

    const { businessIds, channel } = parsed.data;
    const campaignId = randomUUID();
    const provider = getAIProvider();
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let count = 0;
    const skipped: { businessId: string; reason: string }[] = [];
    const startTime = Date.now();
    const TIME_LIMIT_MS = 280_000; // Stop 20s voor Vercel timeout

    // Fase 1: experiment lookup. Bij ontbrekende experimentId in payload valt
    // de batch terug op de Default Cadence experiment (altijd 'control').
    // Bij meegegeven maar onbekende experimentId → 400 (geen stille fallback).
    const lookupExperimentId = parsed.data.experimentId ?? DEFAULT_CADENCE_EXPERIMENT_ID;
    const [experiment] = await db
      .select()
      .from(schema.experiments)
      .where(eq(schema.experiments.id, lookupExperimentId))
      .limit(1);

    if (!experiment) {
      if (parsed.data.experimentId) {
        return NextResponse.json(
          { error: `Experiment ${parsed.data.experimentId} niet gevonden` },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: 'Default Cadence experiment ontbreekt — migratie 0013 niet correct toegepast?' },
        { status: 500 },
      );
    }

    // Sequentieel verwerken (rate limits)
    for (const businessId of businessIds) {
      // Veiligheidscheck: stop voor timeout
      if (Date.now() - startTime > TIME_LIMIT_MS) break;

      // Dedup-gate: skip als al gecontacteerd of actieve draft bestaat.
      // Voorkomt verspilde AI-tokens en drafts die bij approve toch geblokkeerd worden.
      const dedup = await alreadyContactedRecently(businessId);
      if (dedup.contacted) {
        skipped.push({ businessId, reason: dedup.reason ?? 'al gecontacteerd' });
        continue;
      }

      // Safeguard: leads in actieve verkoop-fase (quote_sent / meeting / won) krijgen
      // geen cold-outreach draft. Dezelfde gate zit ook in to-send (last-mile) en
      // qualification-queue (upstream), maar hier sparen we AI-tokens.
      const [pipeline] = await db
        .select({ stage: schema.leadPipeline.stage })
        .from(schema.leadPipeline)
        .where(eq(schema.leadPipeline.businessId, businessId))
        .limit(1);

      if (pipeline && ACTIVE_DEAL_STAGES.includes(pipeline.stage as PipelineStage)) {
        console.warn(
          `[ai/generate/batch] safeguard: skip business=${businessId} stage=${pipeline.stage}`,
        );
        skipped.push({ businessId, reason: `pipeline_stage=${pipeline.stage} (actieve deal)` });
        continue;
      }

      const business = await db.query.businesses.findFirst({
        where: eq(schema.businesses.id, businessId),
      });
      if (!business) continue;

      const audit = await db.query.auditResults.findFirst({
        where: eq(schema.auditResults.businessId, businessId),
      });

      const score = await db.query.leadScores.findFirst({
        where: eq(schema.leadScores.businessId, businessId),
      });

      const toon = getToneForNace(business.naceCode);
      const scoreBreakdown = (score?.scoreBreakdown ?? {}) as Record<string, { points: number; reason: string }>;

      // Hash-based variant assignment: zelfde (businessId, experimentId)
      // geeft altijd dezelfde variant — reproduceerbaar bij retry.
      const giveFirstVariant = assignVariantForLead({
        businessId,
        experimentId: experiment.id,
        splitPercentage: experiment.splitPercentage,
        testVariant: experiment.testVariant,
        controlVariant: experiment.controlVariant,
      });

      const context: OutreachContext = {
        bedrijfsnaam: business.name,
        sector: business.sector,
        stad: business.city,
        street: business.street,
        naceCode: business.naceCode,
        naceDescription: business.naceDescription,
        website: business.website,
        googleRating: business.googleRating,
        googleReviewCount: business.googleReviewCount,
        auditFindings: {
          pagespeedMobile: audit?.pagespeedMobileScore ?? null,
          pagespeedDesktop: audit?.pagespeedDesktopScore ?? null,
          hasSsl: audit?.hasSsl ?? null,
          detectedCms: audit?.detectedCms ?? null,
          hasGoogleAnalytics: audit?.hasGoogleAnalytics ?? null,
          isMobileResponsive: audit?.isMobileResponsive ?? null,
          hasStructuredData: audit?.hasStructuredData ?? null,
        },
        scoreBreakdown,
        totalScore: score?.totalScore ?? 0,
        eerdereOutreach: [],
        toon,
        kanaal: channel,
        giveFirstVariant,
      };

      const { system, user } = generateOutreachPrompt(context);

      const MAX_RETRIES = 2;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await provider.generateText(system, user, { maxTokens: 1024 });
          let variants: { subject?: string; body: string }[];

          // Strip markdown code blocks als de AI die toevoegt
          let text = response.text.trim();
          if (text.startsWith('```')) {
            text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
          }

          // Probeer JSON te extraheren uit de response
          try {
            const parsed = JSON.parse(text);
            variants = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            // Fallback: zoek JSON array/object in de tekst
            const arrayMatch = text.match(/\[[\s\S]*\]/);
            const objMatch = text.match(/\{[\s\S]*\}/);
            if (arrayMatch) {
              variants = JSON.parse(arrayMatch[0]);
            } else if (objMatch) {
              variants = [JSON.parse(objMatch[0])];
            } else {
              if (attempt < MAX_RETRIES) continue;
              console.error(`Batch: JSON parse error voor ${business.name} na ${MAX_RETRIES + 1} pogingen:`, response.text.slice(0, 200));
              break;
            }
          }

          // Fase 1: sla BEIDE varianten op (variant_index 0 en 1) met dezelfde
          // experimentId + giveFirstVariant. AI geeft al 2 tone-varianten terug
          // in één call — vroeger werd variant 1 weggegooid. Per-insert try/catch
          // op 23505 zodat retry-na-partial-save niet steeds crasht (de
          // outreach_drafts_business_active_uniq index blokkeert duplicates).
          let savedThisLead = 0;
          for (let i = 0; i < Math.min(variants.length, 2); i++) {
            const rawVariant = variants[i];
            if (!rawVariant?.body) continue;
            // Post-processing: strip em/en-dashes uit subject/body/ps voor DB-insert.
            // Beschermt tegen AI die ondanks de prompt-ban toch dashes produceert.
            const v = sanitizeVariant(rawVariant);
            try {
              await db.insert(schema.outreachDrafts).values({
                businessId,
                campaignId,
                channel,
                subject: v.subject ?? null,
                body: v.body,
                tone: toon,
                aiProvider: provider.providerName,
                aiModel: provider.modelName,
                promptTokens: response.usage.promptTokens,
                completionTokens: response.usage.completionTokens,
                variantIndex: i,
                experimentId: experiment.id,
                giveFirstVariant,
              });
              savedThisLead++;
            } catch (insertErr) {
              const code =
                (insertErr as { code?: string }).code ??
                (insertErr as { cause?: { code?: string } }).cause?.code;
              if (code === '23505') {
                console.warn(
                  `[ai/generate/batch] variant ${i} for ${businessId} bestaat al (retry-after-partial-save)`,
                );
                savedThisLead++;
              } else {
                throw insertErr;
              }
            }
          }
          // count = aantal verwerkte leads (1 per lead, niet per draft)
          if (savedThisLead > 0) count++;

          totalPromptTokens += response.usage.promptTokens;
          totalCompletionTokens += response.usage.completionTokens;
          break; // Succes, ga naar volgende lead
        } catch (err) {
          if (attempt < MAX_RETRIES) continue;
          console.error(`Batch generate error for ${business.name} na ${MAX_RETRIES + 1} pogingen:`, err);
        }
      }
    }

    // Log totale usage
    await logAIUsage({
      endpoint: '/api/ai/generate/batch',
      aiProvider: provider.providerName,
      aiModel: provider.modelName,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      campaignId,
    });

    return NextResponse.json({
      campaignId,
      count,
      skipped: skipped.length,
      skippedDetails: skipped,
      totalUsage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
    });
  } catch (error) {
    console.error('Batch generate error:', error);
    return NextResponse.json({ error: 'Interne serverfout' }, { status: 500 });
  }
}
