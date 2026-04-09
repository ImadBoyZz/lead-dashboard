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

const batchSchema = z.object({
  businessIds: z.array(z.string().uuid()).min(1).max(20),
  channel: z.enum(['email', 'phone']),
  templateStyle: z.string().optional(),
});

export async function POST(request: NextRequest) {
  if (!isValidSession(request)) {
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

    // Sequentieel verwerken (rate limits)
    for (const businessId of businessIds) {
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
        naceDescription: business.naceDescription,
        website: business.website,
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

      try {
        const response = await provider.generateText(system, user, { maxTokens: 1024 });
        let variants: { subject?: string; body: string }[];

        try {
          variants = JSON.parse(response.text);
          if (!Array.isArray(variants)) continue;
        } catch {
          continue;
        }

        // Sla eerste variant op als draft
        const variant = variants[0];
        if (variant) {
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
      } catch (err) {
        console.error(`Batch generate error for ${businessId}:`, err);
        continue;
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
