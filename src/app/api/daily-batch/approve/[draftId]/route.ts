// Approve een pending draft voor verzending via send worker.
// Conditional UPDATE zodat racy dubbel-approven geen duplicate sends oplevert.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { authenticateSessionOrBearer } from '@/lib/webhook-auth';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  if (!(await authenticateSessionOrBearer(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { draftId } = await params;
  if (!draftId) return NextResponse.json({ error: 'draftId ontbreekt' }, { status: 400 });

  const [draft] = await db
    .select({
      id: schema.outreachDrafts.id,
      status: schema.outreachDrafts.status,
      businessId: schema.outreachDrafts.businessId,
    })
    .from(schema.outreachDrafts)
    .where(eq(schema.outreachDrafts.id, draftId))
    .limit(1);

  if (!draft) return NextResponse.json({ error: 'draft niet gevonden' }, { status: 404 });
  if (draft.status !== 'pending') {
    return NextResponse.json(
      { error: `draft status is ${draft.status}, niet pending` },
      { status: 409 },
    );
  }

  // Extra gate: voorkom approve als lead al effectief gecontacteerd is (via outreach_log).
  // We checken hier NIET draft.status — dat is ons eigen pending-draft state en zou zichzelf blokkeren.
  const cutoff = new Date(Date.now() - 90 * DAY_MS);
  const [logHit] = await db
    .select({ contactedAt: schema.outreachLog.contactedAt })
    .from(schema.outreachLog)
    .where(
      and(
        eq(schema.outreachLog.businessId, draft.businessId),
        gte(schema.outreachLog.contactedAt, cutoff),
      )!,
    )
    .orderBy(dsql`${schema.outreachLog.contactedAt} desc`)
    .limit(1);

  if (logHit) {
    return NextResponse.json(
      { error: `draft geblokkeerd: al gecontacteerd op ${logHit.contactedAt.toISOString()}` },
      { status: 409 },
    );
  }

  const result = await db
    .update(schema.outreachDrafts)
    .set({ status: 'approved', updatedAt: new Date() })
    .where(
      and(
        eq(schema.outreachDrafts.id, draftId),
        eq(schema.outreachDrafts.status, 'pending'),
      )!,
    )
    .returning({ id: schema.outreachDrafts.id, status: schema.outreachDrafts.status });

  if (result.length === 0) {
    return NextResponse.json({ error: 'draft al in andere state — race' }, { status: 409 });
  }

  return NextResponse.json({ approved: true, draftId, status: result[0].status });
}
