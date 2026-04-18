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
import { logAIUsage } from '@/lib/ai/cost-tracker';
import { ITEMS_PER_PAGE } from '@/lib/constants';

// Pro plan: ruim genoeg voor 25 sequentiële AI calls
export const maxDuration = 300;

const batchSchema = z.object({
  businessIds: z.array(z.string().uuid()).min(1).max(ITEMS_PER_PAGE),
  channel: z.enum(['email', 'phone']),
  templateStyle: z.string().optional(),
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
    const startTime = Date.now();
    const TIME_LIMIT_MS = 280_000; // Stop 20s voor Vercel timeout

    // Sequentieel verwerken (rate limits)
    for (const businessId of businessIds) {
      // Veiligheidscheck: stop voor timeout
      if (Date.now() - startTime > TIME_LIMIT_MS) break;
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

      const context: OutreachContext = {
        bedrijfsnaam: business.name,
        sector: business.sector,
        stad: business.city,
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

          // Sla eerste variant op als draft
          const variant = variants[0];
          if (variant?.body) {
            await db.insert(schema.outreachDrafts).values({
              businessId,
              campaignId,
              channel,
              subject: variant.subject ?? null,
              body: variant.body,
              tone: toon,
              aiProvider: provider.providerName,
              aiModel: provider.modelName,
              promptTokens: response.usage.promptTokens,
              completionTokens: response.usage.completionTokens,
              variantIndex: 0,
            });
            count++;
          }

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
      totalUsage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
    });
  } catch (error) {
    console.error('Batch generate error:', error);
    return NextResponse.json({ error: 'Interne serverfout' }, { status: 500 });
  }
}
