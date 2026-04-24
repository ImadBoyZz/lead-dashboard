// Autonomy control center — server component.
// Queriet rechtstreeks de helpers + DB (geen HTTP call naar /summary om
// side-effect dailyBatches upsert niet onnodig te triggeren bij page render).

export const dynamic = "force-dynamic";

import { and, eq, gte, sql as dsql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Header } from "@/components/layout/header";
import { getWarmupStatus } from "@/lib/deliverability/warmup";
import { getTodayBudgetStatus } from "@/lib/cost-guard";
import { isSendingPaused } from "@/lib/settings/system-settings";
import { StatusStripe } from "./status-stripe";
import { DeliverabilityPanel } from "./deliverability-panel";
import { WarmupProgress } from "./warmup-progress";
import { BudgetGauge } from "./budget-gauge";
import { Timeline7d } from "./timeline-7d";
import { BatchRunsFeed } from "./batch-runs-feed";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function AutonomyPage() {
  const today = startOfToday();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    warmup,
    budget,
    pause,
    sentTodayRow,
    draftCounts,
    deliverability7dRow,
    bouncesPerDayRaw,
    dailyBatchesRows,
    costByEndpoint7d,
  ] = await Promise.all([
    getWarmupStatus(),
    getTodayBudgetStatus(),
    isSendingPaused(),
    db
      .select({ count: dsql<number>`COUNT(*)::int` })
      .from(schema.outreachLog)
      .where(
        and(
          gte(schema.outreachLog.contactedAt, today),
          eq(schema.outreachLog.channel, "email"),
        )!,
      ),
    db
      .select({
        status: schema.outreachDrafts.status,
        count: dsql<number>`COUNT(*)::int`,
      })
      .from(schema.outreachDrafts)
      .where(dsql`${schema.outreachDrafts.status} IN ('pending', 'approved')`)
      .groupBy(schema.outreachDrafts.status),
    db.execute<{
      delivered: string | number;
      bounces: string | number;
      complaints: string | number;
    }>(dsql`
      SELECT
        COUNT(*) FILTER (WHERE delivery_status IS NOT NULL)::int AS delivered,
        COUNT(*) FILTER (WHERE delivery_status IN ('hard_bounced','soft_bounced'))::int AS bounces,
        COUNT(*) FILTER (WHERE delivery_status = 'complained')::int AS complaints
      FROM outreach_log
      WHERE contacted_at >= NOW() - INTERVAL '7 days'
    `),
    db.execute<{ date: string; count: string | number }>(dsql`
      SELECT
        TO_CHAR(date_trunc('day', contacted_at), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS count
      FROM outreach_log
      WHERE contacted_at >= NOW() - INTERVAL '7 days'
        AND delivery_status IN ('hard_bounced', 'soft_bounced')
      GROUP BY 1
      ORDER BY 1
    `),
    db
      .select({
        runDate: schema.dailyBatches.runDate,
        actualSent: schema.dailyBatches.actualSent,
        qualified: schema.dailyBatches.qualified,
        rejected: schema.dailyBatches.rejected,
        costEur: schema.dailyBatches.costEur,
      })
      .from(schema.dailyBatches)
      .where(
        gte(
          schema.dailyBatches.runDate,
          sevenDaysAgo.toISOString().slice(0, 10),
        ),
      )
      .orderBy(schema.dailyBatches.runDate),
    db
      .select({
        endpoint: schema.aiUsageLog.endpoint,
        subtotal: dsql<number>`COALESCE(SUM(${schema.aiUsageLog.costEstimate}), 0)`,
      })
      .from(schema.aiUsageLog)
      .where(gte(schema.aiUsageLog.createdAt, today))
      .groupBy(schema.aiUsageLog.endpoint),
  ]);

  const sentToday = Number(sentTodayRow[0]?.count ?? 0);

  const queueBreakdown: Record<string, number> = {};
  for (const r of draftCounts) queueBreakdown[r.status] = Number(r.count);
  const pendingReview = queueBreakdown.pending ?? 0;
  const approvedQueue = queueBreakdown.approved ?? 0;

  const deliverabilityRows =
    (deliverability7dRow as { rows?: unknown[] }).rows ??
    (deliverability7dRow as unknown as unknown[]);
  const deliverability = (Array.isArray(deliverabilityRows)
    ? (deliverabilityRows[0] as {
        delivered?: number | string;
        bounces?: number | string;
        complaints?: number | string;
      })
    : null) ?? { delivered: 0, bounces: 0, complaints: 0 };

  const delivered = Number(deliverability.delivered ?? 0);
  const bounces = Number(deliverability.bounces ?? 0);
  const complaints = Number(deliverability.complaints ?? 0);
  const bouncePct = delivered > 0 ? (bounces / delivered) * 100 : 0;
  const complaintPct = delivered > 0 ? (complaints / delivered) * 100 : 0;
  const minVolumeMet = delivered >= 20;

  const bouncesRows =
    (bouncesPerDayRaw as { rows?: unknown[] }).rows ??
    (bouncesPerDayRaw as unknown as unknown[]);
  const bouncesByDate = (Array.isArray(bouncesRows) ? bouncesRows : []).map(
    (r) => ({
      date: (r as { date: string }).date,
      count: Number((r as { count: number | string }).count ?? 0),
    }),
  );

  const timelineRows = dailyBatchesRows.map((r) => ({
    runDate: typeof r.runDate === "string" ? r.runDate : String(r.runDate),
    actualSent: r.actualSent ?? 0,
    qualified: r.qualified ?? 0,
    rejected: r.rejected ?? 0,
    costEur: Number(r.costEur ?? 0),
  }));

  const byEndpoint = costByEndpoint7d.map((r) => ({
    endpoint: r.endpoint ?? "unknown",
    costEur: Number(r.subtotal ?? 0),
  }));

  return (
    <>
      <Header
        module="02"
        title="Autonomy"
        description="Controle-paneel voor de autonome cold-outbound cyclus. Alles wat hier gebeurt is zichtbaar en stopbaar."
      />

      <div className="space-y-4">
        <StatusStripe
          sendEnabled={!pause.paused}
          pausedReason={pause.reason ?? null}
          warmupStage={warmup.stage}
          warmupDay={warmup.currentDay}
          warmupCap={warmup.maxSendsToday}
          sentToday={sentToday}
          pendingReview={pendingReview}
          approvedQueue={approvedQueue}
          budgetSpentEur={budget.spentEur}
          budgetTotalEur={budget.budgetEur}
        />

        <DeliverabilityPanel
          delivered={delivered}
          bounces={bounces}
          complaints={complaints}
          bouncePct={bouncePct}
          complaintPct={complaintPct}
          minVolumeMet={minVolumeMet}
        />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <WarmupProgress
              startDate={warmup.startDate}
              currentDay={warmup.currentDay}
              maxSendsToday={warmup.maxSendsToday}
              stage={warmup.stage}
              overridden={warmup.overridden}
            />
          </div>
          <div className="lg:col-span-2">
            <BudgetGauge
              spentEur={budget.spentEur}
              budgetEur={budget.budgetEur}
              byEndpoint={byEndpoint}
            />
          </div>
        </div>

        <Timeline7d rows={timelineRows} bouncesByDate={bouncesByDate} />

        <section className="bg-surface border border-[--color-rule] rounded-[2px]">
          <header className="px-6 pt-5 pb-4 border-b border-[--color-rule]">
            <div className="module-label mb-1.5">§ 06 — cron feed</div>
            <h2 className="text-[15px] leading-[1.3] font-medium text-ink tracking-[-0.01em]">
              Recent runs
            </h2>
            <p className="text-[12.5px] text-ink-muted mt-1 leading-[1.5]">
              Elke autonomy job logt hier — discover, generate, deliverability, qualification. Klik een rij open voor metadata.
            </p>
          </header>
          <div className="px-6 py-5">
            <BatchRunsFeed />
          </div>
        </section>
      </div>
    </>
  );
}
