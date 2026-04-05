import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { and, eq, notInArray, desc } from 'drizzle-orm';
import {
  hasQueueCapacity,
  freezeLead,
  unfreezeLead,
  markAsIgnored,
  markAsWon,
} from '@/lib/pipeline-logic';

const CLOSED_STAGES = ['won', 'ignored'] as const;

/**
 * GET /api/leads/queue
 * Returns actieve wachtrij status + leads.
 */
export async function GET() {
  const capacity = await hasQueueCapacity();

  const activeLeads = await db
    .select({
      pipeline: schema.leadPipeline,
      business: schema.businesses,
      score: schema.leadScores,
    })
    .from(schema.leadPipeline)
    .innerJoin(schema.businesses, eq(schema.leadPipeline.businessId, schema.businesses.id))
    .leftJoin(schema.leadScores, eq(schema.leadPipeline.businessId, schema.leadScores.businessId))
    .where(
      and(
        eq(schema.leadPipeline.frozen, false),
        notInArray(schema.leadPipeline.stage, [...CLOSED_STAGES]),
      ),
    )
    .orderBy(desc(schema.leadScores.totalScore));

  const frozenLeads = await db
    .select({
      pipeline: schema.leadPipeline,
      business: schema.businesses,
      score: schema.leadScores,
    })
    .from(schema.leadPipeline)
    .innerJoin(schema.businesses, eq(schema.leadPipeline.businessId, schema.businesses.id))
    .leftJoin(schema.leadScores, eq(schema.leadPipeline.businessId, schema.leadScores.businessId))
    .where(eq(schema.leadPipeline.frozen, true))
    .orderBy(desc(schema.leadScores.totalScore));

  return NextResponse.json({
    ...capacity,
    active: activeLeads,
    frozen: frozenLeads,
  });
}

/**
 * POST /api/leads/queue
 * Actions: freeze, unfreeze, markLost, markWon
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, businessId } = body;

  if (!businessId || !action) {
    return NextResponse.json({ error: 'businessId and action required' }, { status: 400 });
  }

  switch (action) {
    case 'freeze':
      await freezeLead(businessId);
      return NextResponse.json({ success: true, action: 'frozen' });

    case 'unfreeze': {
      const ok = await unfreezeLead(businessId);
      if (!ok) {
        const capacity = await hasQueueCapacity();
        return NextResponse.json({
          error: `Wachtrij vol (${capacity.activeCount}/${capacity.max})`,
        }, { status: 409 });
      }
      return NextResponse.json({ success: true, action: 'unfrozen' });
    }

    case 'markIgnored':
      await markAsIgnored(businessId, body.rejectionReason ?? 'other', body.lostReason);
      return NextResponse.json({ success: true, action: 'ignored' });

    case 'markWon':
      await markAsWon(businessId, body.wonValue ?? 0);
      return NextResponse.json({ success: true, action: 'won' });

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
