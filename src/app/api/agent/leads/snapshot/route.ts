import { NextRequest, NextResponse } from 'next/server';
import { eq, and, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidAgentToken } from '@/lib/agent-auth';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  // Auth
  if (!isValidAgentToken(request)) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }

  // Rate limit: 30 calls/min
  const { allowed } = rateLimit('agent-snapshot', 30, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit bereikt' }, { status: 429 });
  }

  try {
    const leads = await db
      .select({
        business: {
          id: schema.businesses.id,
          name: schema.businesses.name,
          naceCode: schema.businesses.naceCode,
          naceDescription: schema.businesses.naceDescription,
          sector: schema.businesses.sector,
          city: schema.businesses.city,
          province: schema.businesses.province,
          website: schema.businesses.website,
          leadTemperature: schema.businesses.leadTemperature,
          email: schema.businesses.email,
          phone: schema.businesses.phone,
        },
        leadScore: {
          totalScore: schema.leadScores.totalScore,
          maturityCluster: schema.leadScores.maturityCluster,
          scoreBreakdown: schema.leadScores.scoreBreakdown,
        },
        leadPipeline: {
          stage: schema.leadPipeline.stage,
          priority: schema.leadPipeline.priority,
          lastOutreachAt: schema.leadPipeline.lastOutreachAt,
          outreachCount: schema.leadPipeline.outreachCount,
          nextFollowUpAt: schema.leadPipeline.nextFollowUpAt,
          dealValue: schema.leadPipeline.dealValue,
        },
        leadStatus: {
          status: schema.leadStatuses.status,
          contactedAt: schema.leadStatuses.contactedAt,
          repliedAt: schema.leadStatuses.repliedAt,
          meetingAt: schema.leadStatuses.meetingAt,
        },
      })
      .from(schema.businesses)
      .innerJoin(schema.leadPipeline, eq(schema.businesses.id, schema.leadPipeline.businessId))
      .leftJoin(schema.leadScores, eq(schema.businesses.id, schema.leadScores.businessId))
      .leftJoin(schema.leadStatuses, eq(schema.businesses.id, schema.leadStatuses.businessId))
      .where(
        and(
          eq(schema.leadPipeline.frozen, false),
          notInArray(schema.leadPipeline.stage, ['won', 'ignored']),
        )
      )
      .orderBy(schema.leadScores.totalScore);

    return NextResponse.json(leads);
  } catch (error) {
    console.error('Agent snapshot error:', error);
    return NextResponse.json({ error: 'Interne serverfout' }, { status: 500 });
  }
}
