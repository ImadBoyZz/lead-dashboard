// Feed endpoint voor /autonomy batch_runs panel. Session-auth (client poll 30s).
// Retourneert laatste 30 rows met basic velden + metadata JSONB zodat de
// client per-row kan expanden zonder extra round-trip.

import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  if (!(await isValidSession(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT));

  const rows = await db
    .select({
      id: schema.batchRuns.id,
      jobType: schema.batchRuns.jobType,
      runDate: schema.batchRuns.runDate,
      startedAt: schema.batchRuns.startedAt,
      finishedAt: schema.batchRuns.finishedAt,
      status: schema.batchRuns.status,
      inputCount: schema.batchRuns.inputCount,
      outputCount: schema.batchRuns.outputCount,
      skippedReasons: schema.batchRuns.skippedReasons,
      errorMessage: schema.batchRuns.errorMessage,
      costEur: schema.batchRuns.costEur,
      metadata: schema.batchRuns.metadata,
    })
    .from(schema.batchRuns)
    .orderBy(desc(schema.batchRuns.startedAt))
    .limit(limit);

  return NextResponse.json({
    count: rows.length,
    runs: rows.map((r) => ({
      id: r.id,
      jobType: r.jobType,
      runDate: r.runDate,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      status: r.status,
      inputCount: r.inputCount,
      outputCount: r.outputCount,
      skippedReasons: r.skippedReasons,
      errorMessage: r.errorMessage,
      costEur: r.costEur ? Number(r.costEur) : null,
      metadata: r.metadata,
      durationMs:
        r.finishedAt && r.startedAt
          ? r.finishedAt.getTime() - r.startedAt.getTime()
          : null,
    })),
  });
}
