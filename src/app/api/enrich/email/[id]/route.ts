// Email finder endpoint. Skipt als businesses.email al ingevuld is (KBO/Places
// vullen ~30% gratis). Anders Firecrawl scrape + Haiku extract + MX check.
//
// Schrijft naar businesses.email, emailSource, emailStatus, emailStatusUpdatedAt.
// Plan: ik-wil-mijn-lead-purring-tome.md §Fase 2 /api/enrich/email/[id].

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { findContactEmail } from '@/lib/enrich/email-finder';
import { assertBudgetAvailable, trackAiCost, BudgetExceededError } from '@/lib/cost-guard';
import { authenticateSessionOrBearer } from '@/lib/webhook-auth';

const IDEMPOTENCY_MS = 14 * 24 * 60 * 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticateSessionOrBearer(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: businessId } = await params;
  if (!businessId) return NextResponse.json({ error: 'id ontbreekt' }, { status: 400 });

  try {
    await assertBudgetAvailable();
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return NextResponse.json(
        { error: err.message, spent: err.spent, budget: err.budget },
        { status: 429 },
      );
    }
    throw err;
  }

  const [business] = await db
    .select({
      id: schema.businesses.id,
      name: schema.businesses.name,
      website: schema.businesses.website,
      email: schema.businesses.email,
      emailSource: schema.businesses.emailSource,
      emailStatus: schema.businesses.emailStatus,
      emailStatusUpdatedAt: schema.businesses.emailStatusUpdatedAt,
    })
    .from(schema.businesses)
    .where(eq(schema.businesses.id, businessId))
    .limit(1);

  if (!business) return NextResponse.json({ error: 'business niet gevonden' }, { status: 404 });

  // Email al bekend uit KBO/Places/manual — skip scrape
  if (business.email && business.emailSource && business.emailSource !== 'none') {
    // Verifieer nog wel MX één keer als status 'unverified' is
    if (business.emailStatus === 'unverified') {
      const domain = business.email.split('@')[1];
      const mxValid = domain ? await quickMx(domain) : false;
      await db
        .update(schema.businesses)
        .set({
          emailStatus: mxValid ? 'mx_valid' : 'invalid',
          emailStatusUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.businesses.id, businessId));
      return NextResponse.json({
        businessId,
        email: business.email,
        source: business.emailSource,
        emailStatus: mxValid ? 'mx_valid' : 'invalid',
        skipped: false,
        reason: 'Bestaand email — MX geverifieerd',
      });
    }
    return NextResponse.json({
      businessId,
      email: business.email,
      source: business.emailSource,
      emailStatus: business.emailStatus,
      skipped: true,
      reason: 'Email al bekend uit bestaande bron',
    });
  }

  // Idempotency: skip als we recent scrape probeerden zonder resultaat
  if (
    business.emailStatusUpdatedAt &&
    Date.now() - business.emailStatusUpdatedAt.getTime() < IDEMPOTENCY_MS &&
    business.emailStatus !== 'unverified'
  ) {
    return NextResponse.json({
      businessId,
      skipped: true,
      reason: 'Recent scrape gedaan (<14 dagen)',
      email: business.email,
      emailStatus: business.emailStatus,
    });
  }

  if (!business.website) {
    await db
      .update(schema.businesses)
      .set({
        emailSource: 'none',
        emailStatus: 'unverified',
        emailStatusUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.businesses.id, businessId));
    return NextResponse.json({
      businessId,
      email: null,
      source: 'none',
      reason: 'Geen website om te scrapen',
      emailStatus: 'unverified',
    });
  }

  const result = await findContactEmail({
    website: business.website,
    businessName: business.name,
  });

  // Log AI cost
  if (result.costEur > 0) {
    await trackAiCost({
      endpoint: '/api/enrich/email/[id]',
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      costEur: result.costEur,
      businessId,
    });
  }

  const emailStatus = result.mxValid === true
    ? 'mx_valid'
    : result.mxValid === false
      ? 'invalid'
      : 'unverified';

  await db
    .update(schema.businesses)
    .set({
      email: result.email ?? business.email,
      emailSource: result.email ? (result.source === 'none' ? 'none' : 'firecrawl') : 'none',
      emailStatus,
      emailStatusUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.businesses.id, businessId));

  return NextResponse.json({
    businessId,
    email: result.email,
    source: result.source,
    generic: result.generic,
    mxValid: result.mxValid,
    emailStatus,
    confidence: result.confidence,
    reason: result.reason,
    scrapedPaths: result.scrapedPaths,
    cost: result.costEur,
  });
}

async function quickMx(domain: string): Promise<boolean> {
  const { promises: dns } = await import('node:dns');
  try {
    const recs = await dns.resolveMx(domain);
    return recs.length > 0;
  } catch {
    return false;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticateSessionOrBearer(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const [b] = await db
    .select({
      id: schema.businesses.id,
      name: schema.businesses.name,
      email: schema.businesses.email,
      emailSource: schema.businesses.emailSource,
      emailStatus: schema.businesses.emailStatus,
      emailStatusUpdatedAt: schema.businesses.emailStatusUpdatedAt,
    })
    .from(schema.businesses)
    .where(eq(schema.businesses.id, id))
    .limit(1);
  if (!b) return NextResponse.json({ error: 'business niet gevonden' }, { status: 404 });
  return NextResponse.json(b);
}
