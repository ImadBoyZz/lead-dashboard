import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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

const queueActionSchema = z.object({
  action: z.enum(['freeze', 'unfreeze', 'markIgnored', 'markWon']),
  businessId: z.string().uuid(),
  rejectionReason: z.enum(['no_budget', 'no_interest', 'has_supplier', 'bad_timing', 'no_response', 'other']).optional(),
  lostReason: z.string().max(500).optional(),
  wonValue: z.number().min(0).optional(),
});

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
  const parsed = queueActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  const { action, businessId } = parsed.data;

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
      await markAsIgnored(businessId, parsed.data.rejectionReason ?? 'other', parsed.data.lostReason);
      return NextResponse.json({ success: true, action: 'ignored' });

    case 'markWon':
      await markAsWon(businessId, parsed.data.wonValue ?? 0);
      return NextResponse.json({ success: true, action: 'won' });

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
