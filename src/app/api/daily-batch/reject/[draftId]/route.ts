// Reject een pending/approved draft. Schrijft naar scoringFeedback zodat de
// ML-loop over tijd kan leren welke leads Imad afwijst en waarom.
//
// Plan: ik-wil-mijn-lead-purring-tome.md §Fase 2/3 reject reason enum.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { authenticateSessionOrBearer } from '@/lib/webhook-auth';

const rejectSchema = z.object({
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  if (!(await authenticateSessionOrBearer(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { draftId } = await params;
  if (!draftId) return NextResponse.json({ error: 'draftId ontbreekt' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ongeldige input', details: parsed.error.flatten() }, { status: 400 });
  }
  const { reason, note } = parsed.data;

  const [draft] = await db
    .select({
      id: schema.outreachDrafts.id,
      status: schema.outreachDrafts.status,
      businessId: schema.outreachDrafts.businessId,
      channel: schema.outreachDrafts.channel,
      templateId: schema.outreachDrafts.templateId,
    })
    .from(schema.outreachDrafts)
    .where(eq(schema.outreachDrafts.id, draftId))
    .limit(1);

  if (!draft) return NextResponse.json({ error: 'draft niet gevonden' }, { status: 404 });

  // Alleen pending of approved mogen afgewezen worden; sending/sent niet meer terugdraaien
  const result = await db
    .update(schema.outreachDrafts)
    .set({ status: 'rejected', updatedAt: new Date() })
    .where(
      and(
        eq(schema.outreachDrafts.id, draftId),
        or(
          eq(schema.outreachDrafts.status, 'pending'),
          eq(schema.outreachDrafts.status, 'approved'),
        )!,
      )!,
    )
    .returning({ id: schema.outreachDrafts.id });

  if (result.length === 0) {
    return NextResponse.json(
      { error: `draft status is ${draft.status} — niet reject-baar` },
      { status: 409 },
    );
  }

  // Snapshot van business + score voor scoringFeedback
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
    console.error('[reject] scoringFeedback insert faalde:', err);
  }

  return NextResponse.json({ rejected: true, draftId, reason, note: note ?? null });
}
