// Daily summary: end-of-day metrics voor Telegram/email digest.
// Aangeroepen door n8n cron 18:00 Europe/Brussels.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { authenticateSessionOrBearer } from '@/lib/webhook-auth';
import { getWarmupStatus } from '@/lib/deliverability/warmup';
import { getTodayBudgetStatus } from '@/lib/cost-guard';
import { isSendingPaused } from '@/lib/settings/system-settings';

export async function GET(req: NextRequest) {
  if (!(await authenticateSessionOrBearer(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  const day = dateParam ? new Date(dateParam + 'T00:00:00.000Z') : startOfToday();
  const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000);

  const [sentRes, draftStatusRes, costRes, queueRes, warmup, budget, pause] = await Promise.all([
    db
      .select({
        count: dsql<number>`COUNT(*)::int`,
        delivered: dsql<number>`COUNT(*) FILTER (WHERE ${schema.outreachLog.deliveryStatus} = 'delivered')::int`,
        bounced: dsql<number>`COUNT(*) FILTER (WHERE ${schema.outreachLog.deliveryStatus} = 'bounced' OR ${schema.outreachLog.bouncedAt} IS NOT NULL)::int`,
        complained: dsql<number>`COUNT(*) FILTER (WHERE ${schema.outreachLog.complainedAt} IS NOT NULL)::int`,
      })
      .from(schema.outreachLog)
      .where(
        and(
          gte(schema.outreachLog.contactedAt, day),
          dsql`${schema.outreachLog.contactedAt} < ${dayEnd}`,
          eq(schema.outreachLog.channel, 'email'),
        )!,
      ),
    db
      .select({
        status: schema.outreachDrafts.status,
        count: dsql<number>`COUNT(*)::int`,
      })
      .from(schema.outreachDrafts)
      .where(
        and(
          gte(schema.outreachDrafts.updatedAt, day),
          dsql`${schema.outreachDrafts.updatedAt} < ${dayEnd}`,
        )!,
      )
      .groupBy(schema.outreachDrafts.status),
    db
      .select({
        endpoint: schema.aiUsageLog.endpoint,
        subtotal: dsql<number>`COALESCE(SUM(${schema.aiUsageLog.costEstimate}), 0)`,
      })
      .from(schema.aiUsageLog)
      .where(
        and(
          gte(schema.aiUsageLog.createdAt, day),
          dsql`${schema.aiUsageLog.createdAt} < ${dayEnd}`,
        )!,
      )
      .groupBy(schema.aiUsageLog.endpoint),
    db
      .select({
        status: schema.outreachDrafts.status,
        count: dsql<number>`COUNT(*)::int`,
      })
      .from(schema.outreachDrafts)
      .where(
        dsql`${schema.outreachDrafts.status} IN ('pending', 'approved')`,
      )
      .groupBy(schema.outreachDrafts.status),
    getWarmupStatus(),
    getTodayBudgetStatus(),
    isSendingPaused(),
  ]);

  const draftBreakdown: Record<string, number> = {};
  for (const r of draftStatusRes) draftBreakdown[r.status] = r.count;

  const queueBreakdown: Record<string, number> = {};
  for (const r of queueRes) queueBreakdown[r.status] = r.count;

  // Topreject reasons (laatste 7 dagen) — handig voor digest top-5
  const sevenDaysAgo = new Date(day.getTime() - 7 * 24 * 60 * 60 * 1000);
  const topRejectReasons = await db
    .select({
      reason: schema.scoringFeedback.outcome,
      count: dsql<number>`COUNT(*)::int`,
    })
    .from(schema.scoringFeedback)
    .where(
      and(
        gte(schema.scoringFeedback.createdAt, sevenDaysAgo),
        dsql`${schema.scoringFeedback.outcome} LIKE 'rejected:%'`,
      )!,
    )
    .groupBy(schema.scoringFeedback.outcome)
    .orderBy(dsql`COUNT(*) DESC`)
    .limit(5);

  const sentRow = sentRes[0] ?? { count: 0, delivered: 0, bounced: 0, complained: 0 };

  const costByEndpoint: Record<string, number> = {};
  let costTotal = 0;
  for (const row of costRes) {
    const sub = Number(row.subtotal);
    costByEndpoint[row.endpoint] = Number(sub.toFixed(4));
    costTotal += sub;
  }

  const bouncedPct =
    sentRow.count > 0 ? Number(((sentRow.bounced / sentRow.count) * 100).toFixed(2)) : 0;
  const complainedPct =
    sentRow.count > 0 ? Number(((sentRow.complained / sentRow.count) * 100).toFixed(2)) : 0;

  // Upsert dailyBatches voor historische tracking — één row per dag.
  // Neon HTTP zonder transacties: ON CONFLICT DO UPDATE is atomair.
  const dayIso = day.toISOString().slice(0, 10);
  const qualified = (draftBreakdown.sent ?? 0) + (draftBreakdown.approved ?? 0);
  const rejected = draftBreakdown.rejected ?? 0;
  try {
    await db
      .insert(schema.dailyBatches)
      .values({
        runDate: dayIso,
        leadsProcessed: qualified + rejected,
        qualified,
        rejected,
        costEur: costTotal,
        maxSendsToday: warmup.maxSendsToday,
        actualSent: sentRow.count,
        deliverabilityScore:
          sentRow.count > 0 ? Number((1 - bouncedPct / 100).toFixed(3)) : null,
      })
      .onConflictDoUpdate({
        target: schema.dailyBatches.runDate,
        set: {
          leadsProcessed: qualified + rejected,
          qualified,
          rejected,
          costEur: costTotal,
          maxSendsToday: warmup.maxSendsToday,
          actualSent: sentRow.count,
          deliverabilityScore:
            sentRow.count > 0 ? Number((1 - bouncedPct / 100).toFixed(3)) : null,
          completedAt: new Date(),
        },
      });
  } catch (err) {
    console.error('[summary] dailyBatches upsert fout:', err);
  }

  return NextResponse.json({
    date: day.toISOString().slice(0, 10),
    paused: pause.paused,
    pauseReason: pause.reason ?? null,
    sent: {
      total: sentRow.count,
      delivered: sentRow.delivered,
      bounced: sentRow.bounced,
      complained: sentRow.complained,
      bouncedPct,
      complainedPct,
    },
    drafts: {
      breakdownToday: draftBreakdown,
    },
    queue: {
      pending: queueBreakdown.pending ?? 0,
      approved: queueBreakdown.approved ?? 0,
    },
    cost: {
      totalEur: Number(costTotal.toFixed(4)),
      byEndpoint: costByEndpoint,
      budgetEur: budget.budgetEur,
      remainingEur: Number(budget.remainingEur.toFixed(4)),
      pct: budget.budgetEur > 0 ? Number(((budget.spentEur / budget.budgetEur) * 100).toFixed(1)) : 0,
    },
    warmup: {
      stage: warmup.stage,
      currentDay: warmup.currentDay,
      maxSendsToday: warmup.maxSendsToday,
    },
    topRejectReasonsLast7Days: topRejectReasons,
  });
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
