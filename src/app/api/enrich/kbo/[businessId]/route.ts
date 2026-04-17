// KBO enrichment endpoint: match een lead tegen de staging tabellen en
// vul foundedDate/naceCode/legalForm (+ kbo-velden) wanneer match gevonden.
//
// Plan: ik-heb-eigenlijk-een-merry-oasis.md §Chunk 3.
//
// Idempotent: skip als businesses.kboMatchedAt recent is (< 7 dagen).
// Gratis: geen cost-guard nodig.

import { NextRequest, NextResponse } from 'next/server';
import { eq, isNull, or, sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { matchKboEnterprise } from '@/lib/kbo/matcher';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  if (!businessId) {
    return NextResponse.json({ error: 'businessId ontbreekt' }, { status: 400 });
  }

  const [business] = await db
    .select({
      id: schema.businesses.id,
      name: schema.businesses.name,
      postalCode: schema.businesses.postalCode,
      country: schema.businesses.country,
      kboMatchedAt: schema.businesses.kboMatchedAt,
      foundedDate: schema.businesses.foundedDate,
      naceCode: schema.businesses.naceCode,
      legalForm: schema.businesses.legalForm,
    })
    .from(schema.businesses)
    .where(eq(schema.businesses.id, businessId))
    .limit(1);

  if (!business) {
    return NextResponse.json({ error: 'business niet gevonden' }, { status: 404 });
  }

  if (business.country !== 'BE') {
    return NextResponse.json({
      skipped: true,
      reason: 'KBO is BE-only; lead heeft ander land',
    });
  }

  // Idempotency: skip als recent gematcht
  if (business.kboMatchedAt && Date.now() - business.kboMatchedAt.getTime() < SEVEN_DAYS_MS) {
    return NextResponse.json({
      skipped: true,
      reason: 'Recent gematcht (<7 dagen)',
      kboMatchedAt: business.kboMatchedAt.toISOString(),
    });
  }

  const match = await matchKboEnterprise({
    name: business.name,
    postalCode: business.postalCode,
  });

  if (!match) {
    // Markeer als "geprobeerd maar niet gematcht" — voorkomt oneindige re-tries
    await db
      .update(schema.businesses)
      .set({
        kboMatchedAt: new Date(),
        kboMatchConfidence: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.businesses.id, businessId));

    return NextResponse.json({
      matched: false,
      reason: 'Geen exact match in KBO staging',
    });
  }

  // Patch alleen velden die nog null zijn — nooit overschrijven wat al uit een
  // andere bron kwam (respecteert manueel ingevulde data).
  const update: Partial<typeof schema.businesses.$inferInsert> = {
    kboEnterpriseNumber: match.enterpriseNumber,
    kboMatchConfidence: match.confidence,
    kboMatchedAt: new Date(),
    updatedAt: new Date(),
  };

  if (!business.foundedDate && match.foundedDate) update.foundedDate = match.foundedDate;
  if (!business.naceCode && match.naceCode) update.naceCode = match.naceCode;
  if (!business.legalForm && match.legalForm) update.legalForm = match.legalForm;

  await db.update(schema.businesses).set(update).where(eq(schema.businesses.id, businessId));

  return NextResponse.json({
    matched: true,
    enterpriseNumber: match.enterpriseNumber,
    confidence: match.confidence,
    strategy: match.matchStrategy,
    fieldsUpdated: {
      foundedDate: !business.foundedDate && !!match.foundedDate,
      naceCode: !business.naceCode && !!match.naceCode,
      legalForm: !business.legalForm && !!match.legalForm,
    },
    kboData: {
      foundedDate: match.foundedDate,
      naceCode: match.naceCode,
      legalForm: match.legalForm,
      juridicalSituation: match.juridicalSituation,
    },
  });
}

// GET: handige health-check die laat zien hoeveel leads nog niet gematcht zijn
export async function GET() {
  const [row] = await db
    .select({
      total: dsql<number>`count(*)::int`,
      matched: dsql<number>`count(*) filter (where ${schema.businesses.kboMatchedAt} is not null)::int`,
      successful: dsql<number>`count(*) filter (where ${schema.businesses.kboEnterpriseNumber} is not null)::int`,
    })
    .from(schema.businesses)
    .where(
      or(
        eq(schema.businesses.country, 'BE'),
        isNull(schema.businesses.country),
      )!,
    );

  return NextResponse.json({
    totalBeLeads: row?.total ?? 0,
    kboAttempted: row?.matched ?? 0,
    kboMatched: row?.successful ?? 0,
  });
}
