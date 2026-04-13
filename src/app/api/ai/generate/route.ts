import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { getAIProvider } from '@/lib/ai/provider';
import { getToneForNace } from '@/lib/ai/tone';
import { generateOutreachPrompt, type OutreachContext } from '@/lib/ai/prompts';
import { logAIUsage } from '@/lib/ai/cost-tracker';

export const maxDuration = 30;

const generateSchema = z.object({
  businessId: z.string().uuid(),
  channel: z.enum(['email', 'phone']),
  templateId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  if (!(await isValidSession(request))) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }

  const { allowed } = rateLimit('ai-generate', 10, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Te veel verzoeken. Probeer het later opnieuw.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validatie mislukt', details: parsed.error.flatten() }, { status: 400 });
    }

    const { businessId, channel } = parsed.data;

    // Fetch business + audit + score + outreach history
    const business = await db.query.businesses.findFirst({
      where: eq(schema.businesses.id, businessId),
    });
    if (!business) {
      return NextResponse.json({ error: 'Bedrijf niet gevonden' }, { status: 404 });
    }

    const audit = await db.query.auditResults.findFirst({
      where: eq(schema.auditResults.businessId, businessId),
    });

    const score = await db.query.leadScores.findFirst({
      where: eq(schema.leadScores.businessId, businessId),
    });

    const recentOutreach = await db
      .select()
      .from(schema.outreachLog)
      .where(eq(schema.outreachLog.businessId, businessId))
      .orderBy(schema.outreachLog.contactedAt)
      .limit(5);

    // Bouw context
    const toon = getToneForNace(business.naceCode);
    const scoreBreakdown = (score?.scoreBreakdown ?? {}) as Record<string, { points: number; reason: string }>;

    const context: OutreachContext = {
      bedrijfsnaam: business.name,
      sector: business.sector,
      stad: business.city,
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
      eerdereOutreach: recentOutreach.map((o) => ({
        channel: o.channel,
        outcome: o.outcome,
      })),
      toon,
      kanaal: channel,
    };

    // Genereer via AI
    const { system, user } = generateOutreachPrompt(context);
    const provider = getAIProvider();
    const response = await provider.generateText(system, user);

    // Parse response
    let variants: { subject?: string; body: string }[];
    try {
      let text = response.text.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      variants = JSON.parse(text);
      if (!Array.isArray(variants) || variants.length === 0) {
        throw new Error('Ongeldig AI antwoord');
      }
    } catch {
      return NextResponse.json({
        error: 'AI antwoord kon niet verwerkt worden',
        raw: response.text,
      }, { status: 502 });
    }

    // Log usage
    await logAIUsage({
      endpoint: '/api/ai/generate',
      aiProvider: provider.providerName,
      aiModel: provider.modelName,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      businessId,
    });

    return NextResponse.json({
      variants: variants.slice(0, 2).map((v, i) => ({
        subject: v.subject ?? null,
        body: v.body,
        tone: i === 0 ? 'semi-formal' : 'formal',
        variantIndex: i,
      })),
      usage: response.usage,
    });
  } catch (error) {
    console.error('AI generate error:', error);
    return NextResponse.json({ error: 'Interne serverfout' }, { status: 500 });
  }
}
