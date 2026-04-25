// Tiered website-verdict endpoint. Signaal-stack: SSL + PageSpeed + parked-check.
// Opus visual-age tiebreaker draait alleen als signalen niet eenduidig zijn
// (~20% van leads). Respecteert cost-guard.
//
// Schrijft naar businesses.websiteVerdict + websiteAgeEstimate + websiteVerdictAt.
// Plan: ik-wil-mijn-lead-purring-tome.md §Fase 2 /api/enrich/website/[id].

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import {
  collectWebsiteSignals,
  decideFromSignals,
  fetchHomepageForTiebreaker,
  type WebsiteVerdict,
} from '@/lib/enrich/website-signals';
import { tiebreakVisualAge } from '@/lib/enrich/website-tiebreaker';
import { FIRECRAWL_SCRAPE_COST_EUR } from '@/lib/enrich/firecrawl';
import {
  assertBudgetAvailable,
  hasBudgetFor,
  trackAiCost,
  BudgetExceededError,
} from '@/lib/cost-guard';
import { authenticateSessionOrBearer } from '@/lib/webhook-auth';
import { env } from '@/lib/env';

const IDEMPOTENCY_MS = 14 * 24 * 60 * 60 * 1000; // 14 dagen
const ESTIMATED_OPUS_COST_EUR = 0.015; // veiligheidsmarge voor budget-check

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
      websiteVerdict: schema.businesses.websiteVerdict,
      websiteVerdictAt: schema.businesses.websiteVerdictAt,
      websiteAgeEstimate: schema.businesses.websiteAgeEstimate,
    })
    .from(schema.businesses)
    .where(eq(schema.businesses.id, businessId))
    .limit(1);

  if (!business) return NextResponse.json({ error: 'business niet gevonden' }, { status: 404 });

  // Idempotency: verse verdicten niet overschrijven
  if (
    business.websiteVerdictAt &&
    business.websiteVerdict &&
    Date.now() - business.websiteVerdictAt.getTime() < IDEMPOTENCY_MS
  ) {
    return NextResponse.json({
      skipped: true,
      reason: 'Recent verdict aanwezig (<14 dagen)',
      verdict: business.websiteVerdict,
      ageEstimate: business.websiteAgeEstimate,
    });
  }

  // Geen website = direct 'none'
  if (!business.website) {
    await persist(businessId, 'none', null);
    return NextResponse.json({ businessId, verdict: 'none', reason: 'Geen website bekend', trail: [] });
  }

  // Verzamel signalen
  const signals = await collectWebsiteSignals(business.website);
  const initial = decideFromSignals(signals);

  const trail: Array<Record<string, unknown>> = [
    { step: 'signals', ...signals },
    { step: 'initial_decision', ...initial },
  ];

  let finalVerdict: WebsiteVerdict = initial.verdict;
  let ageEstimate: number | null = null;
  let finalReason = initial.reason;

  // Low-budget fallback: tiebreaker uit → 'acceptable' (NIET 'outdated').
  // Acceptable blokkeert auto-promote → twijfelgeval gaat naar manuele review.
  if (initial.needsTiebreaker && !env.TIEBREAKER_ENABLED) {
    finalVerdict = 'acceptable';
    finalReason = 'tiebreaker uit (TIEBREAKER_ENABLED=false) — naar manuele review';
    trail.push({ step: 'tiebreaker_skipped', reason: 'TIEBREAKER_ENABLED=false' });
  }

  // Tiebreaker alleen als nodig én budget ruimte is én feature flag aan staat
  if (initial.needsTiebreaker && signals.reachable && env.TIEBREAKER_ENABLED) {
    const budgetOk = await hasBudgetFor(ESTIMATED_OPUS_COST_EUR + FIRECRAWL_SCRAPE_COST_EUR);
    if (!budgetOk) {
      trail.push({ step: 'tiebreaker_skipped', reason: 'budget te krap voor Opus tiebreaker' });
    } else {
      try {
        const markdown = await fetchHomepageForTiebreaker(business.website);
        if (!markdown || markdown.length < 100) {
          trail.push({ step: 'tiebreaker_skipped', reason: 'scrape leverde te weinig content' });
        } else {
          const tb = await tiebreakVisualAge({
            website: business.website,
            markdown,
            pagespeedMobile: signals.pagespeedMobile,
          });
          await trackAiCost({
            endpoint: '/api/enrich/website/[id]:tiebreaker',
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
            promptTokens: tb.promptTokens,
            completionTokens: tb.completionTokens,
            costEur: tb.costEur + FIRECRAWL_SCRAPE_COST_EUR,
            businessId,
          });
          // Confidence gate: 'outdated' verdict met confidence < 0.7 → 'acceptable'.
          // Active-maintenance signals (≥2) dwingen óók 'acceptable' ongeacht verdict.
          let gatedVerdict = tb.verdict;
          let gatedReason = tb.reason;
          if (tb.verdict === 'outdated' && tb.confidence < 0.7) {
            gatedVerdict = 'acceptable';
            gatedReason = `low-confidence outdated (${tb.confidence.toFixed(2)}) → acceptable: ${tb.reason}`;
          } else if (tb.verdict === 'outdated' && tb.activeMaintenanceSignals.length >= 2) {
            gatedVerdict = 'acceptable';
            gatedReason = `active maintenance (${tb.activeMaintenanceSignals.join(', ')}) → acceptable`;
          }
          finalVerdict = gatedVerdict;
          ageEstimate = tb.ageEstimateYears;
          finalReason = gatedReason;
          trail.push({
            step: 'tiebreaker',
            verdict: tb.verdict,
            gatedVerdict,
            age: tb.ageEstimateYears,
            confidence: tb.confidence,
            activeMaintenanceSignals: tb.activeMaintenanceSignals,
            costEur: tb.costEur + FIRECRAWL_SCRAPE_COST_EUR,
          });
        }
      } catch (err) {
        console.error('[enrich/website] tiebreaker fout:', err);
        await logDlq(businessId, err);
        trail.push({ step: 'tiebreaker_failed', error: (err as Error).message });
      }
    }
  }

  await persist(businessId, finalVerdict, ageEstimate);

  return NextResponse.json({
    businessId,
    verdict: finalVerdict,
    ageEstimate,
    reason: finalReason,
    trail,
  });
}

async function persist(businessId: string, verdict: WebsiteVerdict, ageEstimate: number | null) {
  await db
    .update(schema.businesses)
    .set({
      websiteVerdict: verdict,
      websiteAgeEstimate: ageEstimate,
      websiteVerdictAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.businesses.id, businessId));
}

async function logDlq(businessId: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await db.insert(schema.dlqEnrichments).values({
      businessId,
      step: 'website',
      error: message.slice(0, 500),
      errorDetail: { stack: err instanceof Error ? err.stack?.slice(0, 2000) : null },
    });
  } catch (dbErr) {
    console.error('[enrich/website] DLQ insert faalde:', dbErr);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticateSessionOrBearer(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: businessId } = await params;
  const [b] = await db
    .select({
      id: schema.businesses.id,
      name: schema.businesses.name,
      website: schema.businesses.website,
      websiteVerdict: schema.businesses.websiteVerdict,
      websiteAgeEstimate: schema.businesses.websiteAgeEstimate,
      websiteVerdictAt: schema.businesses.websiteVerdictAt,
    })
    .from(schema.businesses)
    .where(eq(schema.businesses.id, businessId))
    .limit(1);
  if (!b) return NextResponse.json({ error: 'business niet gevonden' }, { status: 404 });
  return NextResponse.json(b);
}
