// Compacte health-indicator voor sidebar-dot. Session-auth (same-origin fetch
// vanuit client component). Samenvat: send_enabled, budget %, recente failed runs.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidSession } from '@/lib/auth';
import { isSendingPaused } from '@/lib/settings/system-settings';
import { getTodayBudgetStatus } from '@/lib/cost-guard';

export const dynamic = 'force-dynamic';

type HealthState = 'green' | 'yellow' | 'red' | 'unknown';

export async function GET(req: NextRequest) {
  if (!(await isValidSession(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pauseState = await isSendingPaused();
  const budget = await getTodayBudgetStatus();
  const budgetPct = budget.budgetEur > 0
    ? Math.round((budget.spentEur / budget.budgetEur) * 100)
    : 0;

  // Failed runs laatste uur
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [failedRow] = await db
    .select({ n: dsql<number>`COUNT(*)` })
    .from(schema.batchRuns)
    .where(
      and(
        eq(schema.batchRuns.status, 'error'),
        gte(schema.batchRuns.startedAt, oneHourAgo),
      ),
    );
  const failedRecent = Number(failedRow?.n ?? 0);

  // Running runs nu
  const [runningRow] = await db
    .select({ n: dsql<number>`COUNT(*)` })
    .from(schema.batchRuns)
    .where(eq(schema.batchRuns.status, 'running'));
  const runningCount = Number(runningRow?.n ?? 0);

  let state: HealthState = 'green';
  if (pauseState.paused) {
    state = 'red';
  } else if (failedRecent >= 2 || budgetPct >= 95) {
    state = 'red';
  } else if (failedRecent >= 1 || budgetPct >= 80) {
    state = 'yellow';
  }

  return NextResponse.json({
    state,
    sendEnabled: !pauseState.paused,
    pausedReason: pauseState.paused ? pauseState.reason ?? 'send_disabled' : null,
    budgetPct,
    budgetSpentEur: Number(budget.spentEur.toFixed(4)),
    budgetTotalEur: budget.budgetEur,
    runningCount,
    failedRecent,
  });
}
