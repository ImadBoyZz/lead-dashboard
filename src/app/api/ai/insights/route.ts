import { NextRequest, NextResponse } from 'next/server';
import { sql, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { getAIProvider } from '@/lib/ai/provider';
import { generateInsightsPrompt, type InsightsData } from '@/lib/ai/prompts';
import { logAIUsage } from '@/lib/ai/cost-tracker';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (!(await isValidSession(request))) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }

  const { allowed } = rateLimit('ai-insights', 5, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Te veel verzoeken' }, { status: 429 });
  }

  try {
    // Check minimum data
    const [totalResult] = await db
      .select({ count: count() })
      .from(schema.scoringFeedback);

    if (totalResult.count < 10) {
      return NextResponse.json({ insights: [], message: 'Nog niet genoeg data. Log meer outreach resultaten.' });
    }

    // Sector + channel conversion rates
    const sectorStats = await db
      .select({
        sector: schema.scoringFeedback.sector,
        channel: schema.scoringFeedback.channel,
        total: count(),
        conversions: sql<number>`count(*) filter (where ${schema.scoringFeedback.conversionSuccess} = true)`,
      })
      .from(schema.scoringFeedback)
      .groupBy(schema.scoringFeedback.sector, schema.scoringFeedback.channel);

    // Rejection reasons
    const rejectionReasons = await db
      .select({
        reason: schema.scoringFeedback.outcome,
        count: count(),
      })
      .from(schema.scoringFeedback)
      .where(eq(schema.scoringFeedback.conversionSuccess, false))
      .groupBy(schema.scoringFeedback.outcome);

    const insightsData: InsightsData = {
      sectorStats: sectorStats.map((s) => ({
        sector: s.sector ?? 'Onbekend',
        channel: s.channel,
        total: s.total,
        conversions: s.conversions,
        rate: s.total > 0 ? s.conversions / s.total : 0,
      })),
      topTemplates: [], // Templates nog niet breed in gebruik
      rejectionReasons: rejectionReasons.map((r) => ({
        reason: r.reason ?? 'Onbekend',
        count: r.count,
      })),
      totalFeedback: totalResult.count,
    };

    // AI analyse
    const { system, user } = generateInsightsPrompt(insightsData);
    const provider = getAIProvider();
    const response = await provider.generateText(system, user);

    let insights: { pattern: string; metric: string; recommendation: string }[];
    try {
      insights = JSON.parse(response.text);
      if (!Array.isArray(insights)) insights = [];
    } catch {
      insights = [];
    }

    await logAIUsage({
      endpoint: '/api/ai/insights',
      aiProvider: provider.providerName,
      aiModel: provider.modelName,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
    });

    return NextResponse.json({ insights, totalFeedback: totalResult.count });
  } catch (error) {
    console.error('Insights error:', error);
    return NextResponse.json({ error: 'Interne serverfout' }, { status: 500 });
  }
}
