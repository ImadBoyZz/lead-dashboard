import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { sql, and, lt, isNotNull } from 'drizzle-orm';

/**
 * GET /api/leads/stale?days=90&limit=20
 * Returns leads whose Google Places data is older than `days` days.
 * Used by n8n re-enrichment workflow to find leads needing refresh.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') ?? '90', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 200);

    if (isNaN(days) || isNaN(limit)) {
      return NextResponse.json({ error: 'Ongeldige parameters' }, { status: 400 });
    }

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const staleLeads = await db
      .select({
        id: schema.businesses.id,
        name: schema.businesses.name,
        googlePlacesEnrichedAt: schema.businesses.googlePlacesEnrichedAt,
      })
      .from(schema.businesses)
      .where(
        and(
          isNotNull(schema.businesses.googlePlacesEnrichedAt),
          lt(schema.businesses.googlePlacesEnrichedAt, cutoff),
        ),
      )
      .orderBy(schema.businesses.googlePlacesEnrichedAt)
      .limit(limit);

    return NextResponse.json({ data: staleLeads, count: staleLeads.length });
  } catch (error) {
    console.error('Stale leads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
