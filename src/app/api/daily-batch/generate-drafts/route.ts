// Autonomous draft generator. Bearer-only (n8n), draait 07:30 Mon-Fri.
// Selecteert warme leads (leadTemperature='warm', status=new, geen opt-out/blacklist)
// die nog geen open draft hebben, tot een hard cap van (warmupCap × 2).
//
// Pre-flight gates voorkomen verspilde AI-burn:
//   1. isSendingPaused — geen zin drafts minten als send uit staat
//   2. assertBudgetAvailable — budget op = 429, no-op
//
// Helper zelf doet per-lead dedup + pipeline safeguard + budget floor
// zodat een trage batch niet alle budget opvreet.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, or, desc, sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { authenticateN8n } from '@/lib/webhook-auth';
import { isSendingPaused } from '@/lib/settings/system-settings';
import {
  assertBudgetAvailable,
  BudgetExceededError,
  getTodayBudgetStatus,
} from '@/lib/cost-guard';
import { getMaxSendsToday } from '@/lib/deliverability/warmup';
import {
  generateDraftsForBusinesses,
  ExperimentNotFoundError,
  DefaultCadenceMissingError,
} from '@/lib/outbound/generate-drafts-batch';

export const maxDuration = 300;

const DRAFT_CAP_MULTIPLIER = 2;
const ABSOLUTE_MAX = 50; // hard ceiling ongeacht warmup phase

export async function POST(req: NextRequest) {
  if (!authenticateN8n(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runDate = new Date().toISOString().slice(0, 10);

  const [runRow] = await db
    .insert(schema.batchRuns)
    .values({
      jobType: 'generate-drafts',
      runDate,
      status: 'running',
    })
    .returning({ id: schema.batchRuns.id });

  try {
    const pauseState = await isSendingPaused();
    if (pauseState.paused) {
      await db
        .update(schema.batchRuns)
        .set({
          finishedAt: new Date(),
          status: 'skipped',
          outputCount: 0,
          skippedReasons: { paused: pauseState.reason ?? 'send_disabled' },
        })
        .where(eq(schema.batchRuns.id, runRow.id));
      return NextResponse.json({
        run_id: runRow.id,
        skipped: true,
        reason: pauseState.reason ?? 'send_disabled',
      });
    }

    try {
      await assertBudgetAvailable();
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        await db
          .update(schema.batchRuns)
          .set({
            finishedAt: new Date(),
            status: 'skipped',
            outputCount: 0,
            skippedReasons: { budget_exhausted: { spent: err.spent, budget: err.budget } },
          })
          .where(eq(schema.batchRuns.id, runRow.id));
        return NextResponse.json(
          { run_id: runRow.id, skipped: true, reason: 'budget_exhausted' },
          { status: 429 },
        );
      }
      throw err;
    }

    const warmupCap = await getMaxSendsToday();
    const cap = Math.min(warmupCap * DRAFT_CAP_MULTIPLIER, ABSOLUTE_MAX);

    // Selecteer warm leads zonder open draft of recente outreach (90d).
    // Per-lead dedup/pipeline checks doet de helper; hier filteren we grof
    // zodat we niet meer DB-roundtrips maken dan nodig.
    const candidates = await db
      .select({ id: schema.businesses.id })
      .from(schema.businesses)
      .leftJoin(
        schema.leadStatuses,
        eq(schema.businesses.id, schema.leadStatuses.businessId),
      )
      .where(
        and(
          eq(schema.businesses.optOut, false),
          eq(schema.businesses.blacklisted, false),
          eq(schema.businesses.leadTemperature, 'warm'),
          or(
            eq(schema.leadStatuses.status, 'new'),
            isNull(schema.leadStatuses.status),
          ),
          // Exclude leads met een open draft (pending/approved/sending)
          dsql`NOT EXISTS (
            SELECT 1 FROM ${schema.outreachDrafts}
            WHERE ${schema.outreachDrafts.businessId} = ${schema.businesses.id}
              AND ${schema.outreachDrafts.status} IN ('pending', 'approved', 'sending')
          )`,
          // Exclude leads gecontacteerd in laatste 90 dagen
          dsql`NOT EXISTS (
            SELECT 1 FROM ${schema.outreachLog}
            WHERE ${schema.outreachLog.businessId} = ${schema.businesses.id}
              AND ${schema.outreachLog.contactedAt} > NOW() - INTERVAL '90 days'
          )`,
        ),
      )
      .orderBy(desc(schema.businesses.updatedAt))
      .limit(cap);

    const businessIds = candidates.map((c) => c.id);

    if (businessIds.length === 0) {
      const budget = await getTodayBudgetStatus();
      await db
        .update(schema.batchRuns)
        .set({
          finishedAt: new Date(),
          status: 'ok',
          inputCount: 0,
          outputCount: 0,
          metadata: {
            warmupCap,
            cap,
            budgetSpentEur: budget.spentEur,
            budgetBefore: budget.spentEur,
            reason: 'no_candidates',
          },
        })
        .where(eq(schema.batchRuns.id, runRow.id));
      return NextResponse.json({
        run_id: runRow.id,
        selected: 0,
        generated: 0,
        reason: 'no_candidates',
        warmupCap,
        cap,
      });
    }

    const budgetBefore = await getTodayBudgetStatus();

    const result = await generateDraftsForBusinesses({
      businessIds,
      channel: 'email',
      endpointTag: '/api/daily-batch/generate-drafts',
      timeLimitMs: 280_000,
    });

    const budgetAfter = await getTodayBudgetStatus();
    const costEur = Number((budgetAfter.spentEur - budgetBefore.spentEur).toFixed(4));

    // Tel skipped reasons per type voor analytics
    const skippedByReason: Record<string, number> = {};
    for (const s of result.skipped) {
      const key = s.reason.includes('pipeline_stage')
        ? 'pipeline_active_deal'
        : s.reason.includes('al gecontacteerd') || s.reason.includes('contacted')
          ? 'already_contacted'
          : s.reason;
      skippedByReason[key] = (skippedByReason[key] ?? 0) + 1;
    }

    await db
      .update(schema.batchRuns)
      .set({
        finishedAt: new Date(),
        status: 'ok',
        inputCount: businessIds.length,
        outputCount: result.count,
        skippedReasons: {
          ...skippedByReason,
          ...(result.stoppedEarly && result.stoppedReason
            ? { stopped_early: result.stoppedReason }
            : {}),
        },
        costEur: String(costEur),
        metadata: {
          warmupCap,
          cap,
          campaignId: result.campaignId,
          budgetBefore: budgetBefore.spentEur,
          budgetAfter: budgetAfter.spentEur,
          promptTokens: result.totalPromptTokens,
          completionTokens: result.totalCompletionTokens,
          stoppedEarly: result.stoppedEarly,
          stoppedReason: result.stoppedReason,
        },
      })
      .where(eq(schema.batchRuns.id, runRow.id));

    return NextResponse.json({
      run_id: runRow.id,
      selected: businessIds.length,
      generated: result.count,
      skipped: result.skipped.length,
      skippedByReason,
      stoppedEarly: result.stoppedEarly,
      stoppedReason: result.stoppedReason,
      warmupCap,
      cap,
      costEur,
      campaignId: result.campaignId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[daily-batch/generate-drafts] error', err);

    const status =
      err instanceof ExperimentNotFoundError
        ? 400
        : err instanceof DefaultCadenceMissingError
          ? 500
          : 500;

    await db
      .update(schema.batchRuns)
      .set({ finishedAt: new Date(), status: 'error', errorMessage: message })
      .where(eq(schema.batchRuns.id, runRow.id));
    return NextResponse.json({ error: message, run_id: runRow.id }, { status });
  }
}
