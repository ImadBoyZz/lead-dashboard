// Gedeelde draft-generator voor beide cold-outreach routes:
//   - /api/ai/generate/batch (handmatig via UI, sessie-auth)
//   - /api/daily-batch/generate-drafts (autonomous via n8n, Bearer-auth)
//
// Bevat dedup + pipeline safeguard + AI-call + per-lead dual-variant insert
// + totale cost log. Budget pre-flight moet de caller zelf doen (hij kent
// zijn eigen endpoint-naam voor telemetry).

import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { getAIProvider } from '@/lib/ai/provider';
import { getToneForNace } from '@/lib/ai/tone';
import { generateOutreachPrompt, type OutreachContext } from '@/lib/ai/prompts';
import { sanitizeVariant } from '@/lib/ai/sanitize';
import { logAIUsage } from '@/lib/ai/cost-tracker';
import { alreadyContactedRecently } from '@/lib/dedup';
import { ACTIVE_DEAL_STAGES, type PipelineStage } from '@/lib/pipeline-logic';
import { assignVariantForLead } from '@/lib/ai/variant-assignment';
import { DEFAULT_CADENCE_EXPERIMENT_ID } from '@/lib/sequence-cadence';
import { hasBudgetFor } from '@/lib/cost-guard';

export interface GenerateDraftsParams {
  businessIds: string[];
  channel: 'email' | 'phone';
  experimentId?: string;
  /** Endpoint tag voor aiUsageLog (default: '/api/ai/generate/batch') */
  endpointTag?: string;
  /** Vercel-timeout limiet — default 280s (voor 300s maxDuration routes) */
  timeLimitMs?: number;
  /** Budget per extra lead — stop zodra onder deze drempel */
  perLeadBudgetEur?: number;
}

export interface GenerateDraftsResult {
  campaignId: string;
  count: number;
  skipped: { businessId: string; reason: string }[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  stoppedEarly: boolean;
  stoppedReason: string | null;
}

export class ExperimentNotFoundError extends Error {
  readonly experimentId: string;
  constructor(experimentId: string) {
    super(`Experiment ${experimentId} niet gevonden`);
    this.name = 'ExperimentNotFoundError';
    this.experimentId = experimentId;
  }
}

export class DefaultCadenceMissingError extends Error {
  constructor() {
    super('Default Cadence experiment ontbreekt — migratie 0013 niet correct toegepast?');
    this.name = 'DefaultCadenceMissingError';
  }
}

export async function generateDraftsForBusinesses(
  params: GenerateDraftsParams,
): Promise<GenerateDraftsResult> {
  const {
    businessIds,
    channel,
    experimentId: explicitExperimentId,
    endpointTag = '/api/ai/generate/batch',
    timeLimitMs = 280_000,
    perLeadBudgetEur = 0.08,
  } = params;

  const campaignId = randomUUID();
  const provider = getAIProvider();
  const skipped: { businessId: string; reason: string }[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let count = 0;
  const startTime = Date.now();
  let stoppedEarly = false;
  let stoppedReason: string | null = null;

  const lookupExperimentId = explicitExperimentId ?? DEFAULT_CADENCE_EXPERIMENT_ID;
  const [experiment] = await db
    .select()
    .from(schema.experiments)
    .where(eq(schema.experiments.id, lookupExperimentId))
    .limit(1);

  if (!experiment) {
    if (explicitExperimentId) throw new ExperimentNotFoundError(explicitExperimentId);
    throw new DefaultCadenceMissingError();
  }

  for (const businessId of businessIds) {
    if (Date.now() - startTime > timeLimitMs) {
      stoppedEarly = true;
      stoppedReason = 'timeout';
      break;
    }

    if (!(await hasBudgetFor(perLeadBudgetEur))) {
      stoppedEarly = true;
      stoppedReason = 'budget_exhausted';
      break;
    }

    const dedup = await alreadyContactedRecently(businessId);
    if (dedup.contacted) {
      skipped.push({ businessId, reason: dedup.reason ?? 'al gecontacteerd' });
      continue;
    }

    const [pipeline] = await db
      .select({ stage: schema.leadPipeline.stage })
      .from(schema.leadPipeline)
      .where(eq(schema.leadPipeline.businessId, businessId))
      .limit(1);

    if (pipeline && ACTIVE_DEAL_STAGES.includes(pipeline.stage as PipelineStage)) {
      console.warn(
        `[generate-drafts-batch] safeguard: skip business=${businessId} stage=${pipeline.stage}`,
      );
      skipped.push({ businessId, reason: `pipeline_stage=${pipeline.stage} (actieve deal)` });
      continue;
    }

    const business = await db.query.businesses.findFirst({
      where: eq(schema.businesses.id, businessId),
    });
    if (!business) {
      skipped.push({ businessId, reason: 'business_not_found' });
      continue;
    }

    const audit = await db.query.auditResults.findFirst({
      where: eq(schema.auditResults.businessId, businessId),
    });

    const score = await db.query.leadScores.findFirst({
      where: eq(schema.leadScores.businessId, businessId),
    });

    const toon = getToneForNace(business.naceCode);
    const scoreBreakdown = (score?.scoreBreakdown ?? {}) as Record<
      string,
      { points: number; reason: string }
    >;

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

        let text = response.text.trim();
        if (text.startsWith('```')) {
          text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        try {
          const parsed = JSON.parse(text);
          variants = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          const arrayMatch = text.match(/\[[\s\S]*\]/);
          const objMatch = text.match(/\{[\s\S]*\}/);
          if (arrayMatch) {
            variants = JSON.parse(arrayMatch[0]);
          } else if (objMatch) {
            variants = [JSON.parse(objMatch[0])];
          } else {
            if (attempt < MAX_RETRIES) continue;
            console.error(
              `[generate-drafts-batch] JSON parse error voor ${business.name} na ${MAX_RETRIES + 1} pogingen:`,
              response.text.slice(0, 200),
            );
            break;
          }
        }

        let savedThisLead = 0;
        for (let i = 0; i < Math.min(variants.length, 2); i++) {
          const rawVariant = variants[i];
          if (!rawVariant?.body) continue;
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
                `[generate-drafts-batch] variant ${i} for ${businessId} bestaat al`,
              );
              savedThisLead++;
            } else {
              throw insertErr;
            }
          }
        }
        if (savedThisLead > 0) count++;

        totalPromptTokens += response.usage.promptTokens;
        totalCompletionTokens += response.usage.completionTokens;
        break;
      } catch (err) {
        if (attempt < MAX_RETRIES) continue;
        console.error(
          `[generate-drafts-batch] error voor ${business.name} na ${MAX_RETRIES + 1} pogingen:`,
          err,
        );
        skipped.push({ businessId, reason: 'ai_call_failed' });
      }
    }
  }

  await logAIUsage({
    endpoint: endpointTag,
    aiProvider: provider.providerName,
    aiModel: provider.modelName,
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
    campaignId,
  });

  return {
    campaignId,
    count,
    skipped,
    totalPromptTokens,
    totalCompletionTokens,
    stoppedEarly,
    stoppedReason,
  };
}
