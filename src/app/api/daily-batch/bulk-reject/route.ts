// Bulk reject van meerdere pending/approved drafts in één call.
// Schrijft per draft een scoringFeedback entry zodat de ML-loop leert.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { authenticateSessionOrBearer } from '@/lib/webhook-auth';

export const maxDuration = 120;

const bulkRejectSchema = z.object({
  draftIds: z.array(z.string().uuid()).min(1).max(500),
  reason: z.enum([
    'franchise',
    'te_klein',
    'verkeerde_sector',
    'moderne_site',
    'twijfel',
    'other',
  ]),
  note: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  if (!(await authenticateSessionOrBearer(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bulkRejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ongeldige input', details: parsed.error.flatten() }, { status: 400 });
  }
  const { draftIds, reason, note } = parsed.data;

  const drafts = await db
    .select({
      id: schema.outreachDrafts.id,
      status: schema.outreachDrafts.status,
      businessId: schema.outreachDrafts.businessId,
      channel: schema.outreachDrafts.channel,
      templateId: schema.outreachDrafts.templateId,
    })
    .from(schema.outreachDrafts)
    .where(inArray(schema.outreachDrafts.id, draftIds));

  const rejectable = drafts.filter((d) => d.status === 'pending' || d.status === 'approved');
  const rejectableIds = rejectable.map((d) => d.id);

  if (rejectableIds.length === 0) {
    return NextResponse.json({ rejected: 0, skipped: drafts.length, reason });
  }

  const updated = await db
    .update(schema.outreachDrafts)
    .set({ status: 'rejected', updatedAt: new Date() })
    .where(
      and(
        inArray(schema.outreachDrafts.id, rejectableIds),
        or(
          eq(schema.outreachDrafts.status, 'pending'),
          eq(schema.outreachDrafts.status, 'approved'),
        )!,
      )!,
    )
    .returning({ id: schema.outreachDrafts.id });

  const updatedIds = new Set(updated.map((u) => u.id));
  const effectivelyRejected = rejectable.filter((d) => updatedIds.has(d.id));

  // Snapshots voor scoringFeedback — één query per draft (outreach_log grootte klein genoeg).
  for (const draft of effectivelyRejected) {
    const [bizInfo] = await db
      .select({
        naceCode: schema.businesses.naceCode,
        sector: schema.businesses.sector,
        leadTemperature: schema.businesses.leadTemperature,
      })
      .from(schema.businesses)
      .where(eq(schema.businesses.id, draft.businessId))
      .limit(1);

    const [scoreInfo] = await db
      .select({
        totalScore: schema.leadScores.totalScore,
        scoreBreakdown: schema.leadScores.scoreBreakdown,
        maturityCluster: schema.leadScores.maturityCluster,
      })
      .from(schema.leadScores)
      .where(eq(schema.leadScores.businessId, draft.businessId))
      .limit(1);

    try {
      await db.insert(schema.scoringFeedback).values({
        businessId: draft.businessId,
        channel: draft.channel,
        templateId: draft.templateId,
        outcome: note ? `rejected:${reason} — ${note}` : `rejected:${reason}`,
        naceCode: bizInfo?.naceCode ?? null,
        sector: bizInfo?.sector ?? null,
        maturityCluster: scoreInfo?.maturityCluster ?? null,
        totalScore: scoreInfo?.totalScore ?? 0,
        scoreBreakdown: scoreInfo?.scoreBreakdown ?? {},
        outreachCount: 0,
        leadTemperature: bizInfo?.leadTemperature ?? null,
        conversionSuccess: false,
      });
    } catch (err) {
      console.error('[bulk-reject] scoringFeedback insert faalde voor draft', draft.id, err);
    }
  }

  return NextResponse.json({
    rejected: effectivelyRejected.length,
    skipped: drafts.length - effectivelyRejected.length,
    reason,
    note: note ?? null,
  });
}
