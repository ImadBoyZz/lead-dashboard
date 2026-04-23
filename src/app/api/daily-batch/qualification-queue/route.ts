// Qualification queue: leads die nog niet (volledig) geënricht zijn en kwalificeren
// voor een run van de Morning Qualification Batch in n8n.
//
// n8n itereert het resultaat per lead en roept /api/enrich/full/[id] aan.
// Retourneert maximaal `limit` leads gesorteerd op oudste createdAt eerst
// (FIFO — nieuwe imports krijgen prioriteit).

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, or, sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { authenticateSessionOrBearer } from '@/lib/webhook-auth';
import { ACTIVE_DEAL_STAGES } from '@/lib/pipeline-logic';

export async function GET(req: NextRequest) {
  if (!(await authenticateSessionOrBearer(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get('limit') ?? '50');
  const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 50));

  // Selectie:
  //   - country = 'BE'
  //   - niet opted-out, niet blacklisted
  //   - chain_classification IS NULL OR chain_classified_at IS NULL
  //     OF website_verdict IS NULL
  //     OF email_status = 'unverified'
  //   - geen recente outreach_log entry (laatste 90 dagen)
  //   - niet in actieve sales-fase (quote_sent / meeting / won)
  const rows = await db
    .select({
      id: schema.businesses.id,
      name: schema.businesses.name,
      website: schema.businesses.website,
      naceCode: schema.businesses.naceCode,
      createdAt: schema.businesses.createdAt,
    })
    .from(schema.businesses)
    .where(
      and(
        eq(schema.businesses.country, 'BE'),
        eq(schema.businesses.optOut, false),
        eq(schema.businesses.blacklisted, false),
        or(
          isNull(schema.businesses.chainClassifiedAt),
          isNull(schema.businesses.websiteVerdictAt),
          eq(schema.businesses.emailStatus, 'unverified'),
        )!,
        // LEFT-JOIN-NOT-EXISTS: geen outreach_log entry in laatste 90 dagen
        dsql`NOT EXISTS (
          SELECT 1 FROM outreach_log
          WHERE outreach_log.business_id = ${schema.businesses.id}
            AND outreach_log.contacted_at >= NOW() - INTERVAL '90 days'
        )`,
        // Safeguard: leads in actieve verkoop-fase mogen niet opnieuw door enrichment / batch generation
        dsql`NOT EXISTS (
          SELECT 1 FROM lead_pipeline
          WHERE lead_pipeline.business_id = ${schema.businesses.id}
            AND lead_pipeline.stage IN (${dsql.join(ACTIVE_DEAL_STAGES.map((s) => dsql`${s}`), dsql.raw(','))})
        )`,
      )!,
    )
    .orderBy(schema.businesses.createdAt)
    .limit(limit);

  return NextResponse.json({
    count: rows.length,
    limit,
    leads: rows.map((r) => ({
      id: r.id,
      name: r.name,
      website: r.website,
      naceCode: r.naceCode,
    })),
  });
}
