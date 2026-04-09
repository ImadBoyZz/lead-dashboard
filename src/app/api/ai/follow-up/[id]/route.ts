import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidSession } from '@/lib/auth';
import { getAIProvider } from '@/lib/ai/provider';
import { getToneForNace } from '@/lib/ai/tone';
import { generateFollowUpPrompt, type FollowUpContext } from '@/lib/ai/prompts';
import { logAIUsage } from '@/lib/ai/cost-tracker';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!(await isValidSession(request))) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }

  try {
    // Fetch outreach log entry
    const outreachEntry = await db.query.outreachLog.findFirst({
      where: eq(schema.outreachLog.id, id),
    });
    if (!outreachEntry) {
      return NextResponse.json({ error: 'Outreach niet gevonden' }, { status: 404 });
    }

    const businessId = outreachEntry.businessId;

    // Fetch related data
    const business = await db.query.businesses.findFirst({
      where: eq(schema.businesses.id, businessId),
    });
    if (!business) {
      return NextResponse.json({ error: 'Bedrijf niet gevonden' }, { status: 404 });
    }

    const pipeline = await db.query.leadPipeline.findFirst({
      where: eq(schema.leadPipeline.businessId, businessId),
    });

    const allOutreach = await db
      .select()
      .from(schema.outreachLog)
      .where(eq(schema.outreachLog.businessId, businessId))
      .orderBy(desc(schema.outreachLog.contactedAt));

    const toon = getToneForNace(business.naceCode);

    const context: FollowUpContext = {
      bedrijfsnaam: business.name,
      sector: business.sector,
      stad: business.city,
      naceCode: business.naceCode,
      laatsteOutreach: {
        channel: outreachEntry.channel,
        subject: outreachEntry.subject,
        content: outreachEntry.content,
        outcome: outreachEntry.outcome,
        structuredOutcome: outreachEntry.structuredOutcome,
        contactedAt: outreachEntry.contactedAt.toISOString(),
      },
      alleOutreach: allOutreach.map((o) => ({
        channel: o.channel,
        outcome: o.outcome,
        contactedAt: o.contactedAt.toISOString(),
      })),
      leadTemperature: business.leadTemperature,
      outreachCount: pipeline?.outreachCount ?? allOutreach.length,
      toon,
    };

    const { system, user } = generateFollowUpPrompt(context);
    const provider = getAIProvider();
    const response = await provider.generateText(system, user);

    let suggestion: {
      suggestedAction: string;
      suggestedChannel: string;
      suggestedDays: number;
      draftMessage: string;
      reasoning: string;
    };

    try {
      let text = response.text.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      suggestion = JSON.parse(text);
    } catch {
      return NextResponse.json({
        error: 'AI antwoord kon niet verwerkt worden',
        raw: response.text,
      }, { status: 502 });
    }

    await logAIUsage({
      endpoint: '/api/ai/follow-up',
      aiProvider: provider.providerName,
      aiModel: provider.modelName,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      businessId,
    });

    return NextResponse.json(suggestion);
  } catch (error) {
    console.error('Follow-up suggestion error:', error);
    return NextResponse.json({ error: 'Interne serverfout' }, { status: 500 });
  }
}
