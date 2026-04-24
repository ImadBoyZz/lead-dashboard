// Autonomous discovery endpoint. Bearer-only (n8n). n8n rotert sector/city
// dagelijks; deze route is idempotent — dubbele runs op dezelfde
// (date, sector, city) doen geen nieuwe Places API calls.
//
// Cost-gate: `PLACES_API_MAX_CALLS` blijft in-memory per Vercel instance,
// maar de dagelijkse batch_runs unique-index schermt tegen retry-storms die
// de teller zouden resetten tussen cold starts.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray, sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { authenticateN8n } from '@/lib/webhook-auth';
import {
  discoverLeads,
  buildSearchQueries,
  detectBatchDuplicates,
  type DiscoveredLead,
} from '@/lib/places-discovery';
import { importDiscoveredLeads } from '@/lib/leads/import';

export const maxDuration = 120;

const bodySchema = z.object({
  sector: z.string().min(1),
  city: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(50),
});

export async function POST(req: NextRequest) {
  if (!authenticateN8n(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'invalid_body', detail: msg }, { status: 400 });
  }

  const { sector, city, limit } = parsed;
  const runDate = new Date().toISOString().slice(0, 10);

  // Idempotency: als er vandaag al een geslaagde discover-run is voor deze
  // (sector, city), geef 200 skipped terug zonder Google Places te bellen.
  const existing = await db
    .select({ id: schema.batchRuns.id, outputCount: schema.batchRuns.outputCount })
    .from(schema.batchRuns)
    .where(
      and(
        eq(schema.batchRuns.jobType, 'discover'),
        eq(schema.batchRuns.runDate, runDate),
        eq(schema.batchRuns.status, 'ok'),
        dsql`${schema.batchRuns.metadata}->>'sector' = ${sector}`,
        dsql`${schema.batchRuns.metadata}->>'city' = ${city}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      {
        run_id: existing[0].id,
        skipped: true,
        reason: 'already_ran_today',
        sector,
        city,
        inserted: existing[0].outputCount ?? 0,
      },
      { status: 200 },
    );
  }

  const [runRow] = await db
    .insert(schema.batchRuns)
    .values({
      jobType: 'discover',
      runDate,
      status: 'running',
      metadata: { sector, city, limit },
    })
    .returning({ id: schema.batchRuns.id });

  try {
    const queries = buildSearchQueries(sector, city, 99);
    const seenPlaceIds = new Set<string>();
    const collected: DiscoveredLead[] = [];
    let fromMock = false;
    let apiQueries = 0;

    for (const query of queries) {
      if (collected.length >= limit) break;
      const remaining = limit - collected.length;
      const result = await discoverLeads(query, remaining, city);
      apiQueries += 1;
      fromMock = fromMock || result.fromMock;
      for (const lead of result.leads) {
        if (!seenPlaceIds.has(lead.placeId)) {
          seenPlaceIds.add(lead.placeId);
          collected.push(lead);
        }
      }
    }

    collected.sort((a, b) => b.qualityScore - a.qualityScore);
    const candidates = collected.slice(0, limit);

    let alreadyImported = 0;
    let newLeads: DiscoveredLead[] = candidates;
    if (candidates.length > 0) {
      const placeIds = candidates.map((l) => l.placeId);
      const existingBiz = await db
        .select({ googlePlaceId: schema.businesses.googlePlaceId })
        .from(schema.businesses)
        .where(inArray(schema.businesses.googlePlaceId, placeIds));

      const existingPlaceIds = new Set(
        existingBiz.map((r) => r.googlePlaceId).filter((id): id is string => id !== null),
      );
      newLeads = candidates.filter((l) => !existingPlaceIds.has(l.placeId));
      alreadyImported = candidates.length - newLeads.length;
    }

    detectBatchDuplicates(newLeads);

    const result = await importDiscoveredLeads(sector, city, newLeads);

    const skipped = {
      already_imported: alreadyImported,
      batch_chain_warnings: newLeads.filter((l) => l.chainWarning).length,
    };

    await db
      .update(schema.batchRuns)
      .set({
        finishedAt: new Date(),
        status: 'ok',
        inputCount: collected.length,
        outputCount: result.imported,
        skippedReasons: skipped,
        metadata: {
          sector,
          city,
          limit,
          apiQueries,
          fromMock,
          importLogId: result.importLogId,
          candidates: candidates.length,
        },
      })
      .where(eq(schema.batchRuns.id, runRow.id));

    return NextResponse.json({
      run_id: runRow.id,
      sector,
      city,
      candidates: candidates.length,
      inserted: result.imported,
      duplicates: result.duplicates,
      skipped,
      fromMock,
      apiQueries,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[daily-batch/discover] error', err);
    await db
      .update(schema.batchRuns)
      .set({ finishedAt: new Date(), status: 'error', errorMessage: message })
      .where(eq(schema.batchRuns.id, runRow.id));
    return NextResponse.json({ error: message, run_id: runRow.id }, { status: 500 });
  }
}
