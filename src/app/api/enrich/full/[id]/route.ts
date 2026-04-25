// Single-lead orchestrator: KBO → qualify → website → email.
// Roept lib helpers direct aan (geen interne HTTP fetch naar eigen endpoints)
// om latency en dubbele auth te vermijden. n8n belt dit per lead in een loop.
//
// Respecteert cost-guard per laag. Schrijft trail zodat n8n kan beslissen of
// een draft gegenereerd moet worden (draft-generate blijft aparte step).

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { authenticateSessionOrBearer } from '@/lib/webhook-auth';
import {
  assertBudgetAvailable,
  hasBudgetFor,
  trackAiCost,
  BudgetExceededError,
} from '@/lib/cost-guard';
import { matchKboEnterprise } from '@/lib/kbo/matcher';
import {
  classifyChainLayers1And2,
  isChainDisqualifier,
  type ClassifyResult,
} from '@/lib/classify/franchise';
import { classifyByName, classifyByScrape } from '@/lib/classify/llm-classifier';
import {
  collectWebsiteSignals,
  decideFromSignals,
  fetchHomepageForTiebreaker,
  type WebsiteVerdict,
} from '@/lib/enrich/website-signals';
import { tiebreakVisualAge } from '@/lib/enrich/website-tiebreaker';
import { findContactEmail } from '@/lib/enrich/email-finder';
import { FIRECRAWL_SCRAPE_COST_EUR, scrapeUrlMarkdown } from '@/lib/enrich/firecrawl';
import { tryAutoPromote } from '@/lib/outbound/auto-promote';
import { env } from '@/lib/env';

const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const ESTIMATED_OPUS_COST_EUR = 0.04;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface StepResult {
  step: 'kbo' | 'qualify' | 'website' | 'email';
  status: 'ok' | 'skipped' | 'failed';
  summary: Record<string, unknown>;
}

export const maxDuration = 120;

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
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.id, businessId))
    .limit(1);

  if (!business) return NextResponse.json({ error: 'business niet gevonden' }, { status: 404 });

  const startedAt = Date.now();
  const steps: StepResult[] = [];

  // ── Stap 1: KBO match (gratis, BE only) ──────────────
  steps.push(await runKboStep(business));

  // ── Stap 2: Franchise qualify (4-laags early-exit) ────
  const qualifyResult = await runQualifyStep(business);
  steps.push(qualifyResult.step);

  // Als hard disqualifier → stop hier; zonde van website/email budget
  if (
    qualifyResult.classification &&
    isChainDisqualifier(qualifyResult.classification.classification) &&
    qualifyResult.classification.confidence >= HIGH_CONFIDENCE_THRESHOLD
  ) {
    await markDisqualified(business.id, qualifyResult.classification.reason);
    return NextResponse.json({
      businessId,
      status: 'disqualified_early',
      reason: `Franchise/keten gedetecteerd (confidence ${qualifyResult.classification.confidence})`,
      durationMs: Date.now() - startedAt,
      steps,
    });
  }

  // ── Stap 3: Website verdict ──────────────────────────
  steps.push(await runWebsiteStep(business));

  // ── Stap 4: Email finder ────────────────────────────
  steps.push(await runEmailStep(business));

  // ── Stap 5: Auto-promote naar warm (idempotent, criteria-based) ──
  // Enkel als alle signalen matchen + lead niet handmatig naar cold is gezet.
  const promote = await tryAutoPromote(business.id);

  return NextResponse.json({
    businessId,
    status: 'completed',
    durationMs: Date.now() - startedAt,
    steps,
    autoPromote: promote,
  });
}

// ──────────────────────────────────────────────────────
// KBO step
// ──────────────────────────────────────────────────────

async function runKboStep(
  b: typeof schema.businesses.$inferSelect,
): Promise<StepResult> {
  if (b.country !== 'BE') {
    return { step: 'kbo', status: 'skipped', summary: { reason: 'Niet BE' } };
  }
  if (b.kboMatchedAt && Date.now() - b.kboMatchedAt.getTime() < SEVEN_DAYS_MS) {
    return { step: 'kbo', status: 'skipped', summary: { reason: 'Recent gematcht' } };
  }

  try {
    const match = await matchKboEnterprise({ name: b.name, postalCode: b.postalCode });
    if (!match) {
      await db
        .update(schema.businesses)
        .set({ kboMatchedAt: new Date(), kboMatchConfidence: null, updatedAt: new Date() })
        .where(eq(schema.businesses.id, b.id));
      return { step: 'kbo', status: 'ok', summary: { matched: false } };
    }

    const update: Partial<typeof schema.businesses.$inferInsert> = {
      kboEnterpriseNumber: match.enterpriseNumber,
      kboMatchConfidence: match.confidence,
      kboMatchedAt: new Date(),
      updatedAt: new Date(),
    };
    if (!b.foundedDate && match.foundedDate) update.foundedDate = match.foundedDate;
    if (!b.naceCode && match.naceCode) update.naceCode = match.naceCode;
    if (!b.legalForm && match.legalForm) update.legalForm = match.legalForm;

    await db.update(schema.businesses).set(update).where(eq(schema.businesses.id, b.id));
    return {
      step: 'kbo',
      status: 'ok',
      summary: {
        matched: true,
        enterpriseNumber: match.enterpriseNumber,
        confidence: match.confidence,
        strategy: match.matchStrategy,
      },
    };
  } catch (err) {
    await logDlq(b.id, 'qualify', err); // KBO step heeft geen eigen enum, gebruik qualify
    return { step: 'kbo', status: 'failed', summary: { error: (err as Error).message } };
  }
}

// ──────────────────────────────────────────────────────
// Qualify step (franchise/chain classifier)
// ──────────────────────────────────────────────────────

async function runQualifyStep(
  b: typeof schema.businesses.$inferSelect,
): Promise<{ step: StepResult; classification: ClassifyResult | null }> {
  if (
    b.chainClassifiedAt &&
    b.chainConfidence !== null &&
    b.chainConfidence >= HIGH_CONFIDENCE_THRESHOLD &&
    Date.now() - b.chainClassifiedAt.getTime() < THIRTY_DAYS_MS
  ) {
    return {
      step: {
        step: 'qualify',
        status: 'skipped',
        summary: { reason: 'Recent geklasseerd', classification: b.chainClassification },
      },
      classification: {
        classification: b.chainClassification ?? 'unknown',
        confidence: b.chainConfidence,
        reason: b.chainReason ?? '',
        layerUsed: 'patterns',
      },
    };
  }

  let best: ClassifyResult = await classifyChainLayers1And2({
    name: b.name,
    googleReviewCount: b.googleReviewCount,
    googlePlaceId: b.googlePlaceId,
    website: b.website,
    hasGoogleBusinessProfile: b.hasGoogleBusinessProfile,
  });

  if (best.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    await persistQualify(b.id, best);
    return {
      step: { step: 'qualify', status: 'ok', summary: toQualifySummary(best) },
      classification: best,
    };
  }

  try {
    const l3 = await classifyByName({
      name: b.name,
      city: b.city,
      naceDescription: b.naceDescription,
      googleReviewCount: b.googleReviewCount,
      hasGoogleBusinessProfile: b.hasGoogleBusinessProfile,
      website: b.website,
    });
    await trackAiCost({
      endpoint: '/api/enrich/full/[id]:qualify.l3',
      provider: 'anthropic',
      model: l3.modelUsed,
      promptTokens: l3.promptTokens,
      completionTokens: l3.completionTokens,
      costEur: l3.costEur,
      businessId: b.id,
    });
    if (l3.confidence > best.confidence) {
      best = { classification: l3.classification, confidence: l3.confidence, reason: l3.reason, layerUsed: 'llm_name' };
    }
  } catch (err) {
    console.error('[full.qualify.l3]', err);
    await logDlq(b.id, 'qualify', err);
  }

  if (best.confidence >= HIGH_CONFIDENCE_THRESHOLD || !b.website) {
    await persistQualify(b.id, best);
    return {
      step: { step: 'qualify', status: 'ok', summary: toQualifySummary(best) },
      classification: best,
    };
  }

  try {
    const scraped = await scrapeUrlMarkdown(b.website, { timeoutMs: 20000 });
    if (scraped && scraped.rawTextLen >= 100) {
      const l4 = await classifyByScrape({
        name: b.name,
        website: b.website,
        scrapedText: scraped.markdown,
      });
      await trackAiCost({
        endpoint: '/api/enrich/full/[id]:qualify.l4',
        provider: 'anthropic',
        model: l4.modelUsed,
        promptTokens: l4.promptTokens,
        completionTokens: l4.completionTokens,
        costEur: l4.costEur + FIRECRAWL_SCRAPE_COST_EUR,
        businessId: b.id,
      });
      if (l4.confidence > best.confidence) {
        best = { classification: l4.classification, confidence: l4.confidence, reason: l4.reason, layerUsed: 'llm_scrape' };
      }
    }
  } catch (err) {
    console.error('[full.qualify.l4]', err);
    await logDlq(b.id, 'qualify', err);
  }

  await persistQualify(b.id, best);
  return {
    step: { step: 'qualify', status: 'ok', summary: toQualifySummary(best) },
    classification: best,
  };
}

function toQualifySummary(r: ClassifyResult): Record<string, unknown> {
  return {
    classification: r.classification,
    confidence: r.confidence,
    reason: r.reason,
    layerUsed: r.layerUsed,
  };
}

async function persistQualify(businessId: string, r: ClassifyResult) {
  await db
    .update(schema.businesses)
    .set({
      chainClassification: r.classification,
      chainConfidence: r.confidence,
      chainReason: r.reason,
      chainClassifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.businesses.id, businessId));
}

// ──────────────────────────────────────────────────────
// Website step
// ──────────────────────────────────────────────────────

async function runWebsiteStep(
  b: typeof schema.businesses.$inferSelect,
): Promise<StepResult> {
  if (
    b.websiteVerdictAt &&
    b.websiteVerdict &&
    Date.now() - b.websiteVerdictAt.getTime() < FOURTEEN_DAYS_MS
  ) {
    return {
      step: 'website',
      status: 'skipped',
      summary: { reason: 'Recent verdict', verdict: b.websiteVerdict },
    };
  }

  if (!b.website) {
    await db
      .update(schema.businesses)
      .set({ websiteVerdict: 'none', websiteVerdictAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.businesses.id, b.id));
    return { step: 'website', status: 'ok', summary: { verdict: 'none' } };
  }

  try {
    const signals = await collectWebsiteSignals(b.website);
    const initial = decideFromSignals(signals);
    let finalVerdict: WebsiteVerdict = initial.verdict;
    let ageEstimate: number | null = null;

    // Low-budget fallback: tiebreaker uit → conservatief 'outdated' i.p.v. AI-judgment.
    // Sluit aan bij auto-promote criteria zodat tiebreaker-zone leads alsnog warm worden.
    if (initial.needsTiebreaker && !env.TIEBREAKER_ENABLED) {
      finalVerdict = 'outdated';
    }

    if (initial.needsTiebreaker && signals.reachable && env.TIEBREAKER_ENABLED) {
      const budgetOk = await hasBudgetFor(ESTIMATED_OPUS_COST_EUR + FIRECRAWL_SCRAPE_COST_EUR);
      if (budgetOk) {
        const markdown = await fetchHomepageForTiebreaker(b.website);
        if (markdown && markdown.length >= 100) {
          try {
            const tb = await tiebreakVisualAge({
              website: b.website,
              markdown,
              pagespeedMobile: signals.pagespeedMobile,
            });
            await trackAiCost({
              endpoint: '/api/enrich/full/[id]:website.tiebreaker',
              provider: 'anthropic',
              model: 'claude-opus-4-7',
              promptTokens: tb.promptTokens,
              completionTokens: tb.completionTokens,
              costEur: tb.costEur + FIRECRAWL_SCRAPE_COST_EUR,
              businessId: b.id,
            });
            finalVerdict = tb.verdict;
            ageEstimate = tb.ageEstimateYears;
          } catch (err) {
            console.error('[full.website.tiebreaker]', err);
            await logDlq(b.id, 'website', err);
          }
        }
      }
    }

    await db
      .update(schema.businesses)
      .set({
        websiteVerdict: finalVerdict,
        websiteAgeEstimate: ageEstimate,
        websiteVerdictAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.businesses.id, b.id));

    return {
      step: 'website',
      status: 'ok',
      summary: {
        verdict: finalVerdict,
        ageEstimate,
        hasSsl: signals.hasSsl,
        pagespeedMobile: signals.pagespeedMobile,
        reason: initial.reason,
      },
    };
  } catch (err) {
    await logDlq(b.id, 'website', err);
    return { step: 'website', status: 'failed', summary: { error: (err as Error).message } };
  }
}

// ──────────────────────────────────────────────────────
// Email step
// ──────────────────────────────────────────────────────

async function runEmailStep(
  b: typeof schema.businesses.$inferSelect,
): Promise<StepResult> {
  // Email al bekend uit andere bron
  if (b.email && b.emailSource && b.emailSource !== 'none') {
    return {
      step: 'email',
      status: 'skipped',
      summary: { reason: 'Bestaand email', email: b.email, source: b.emailSource },
    };
  }

  if (
    b.emailStatusUpdatedAt &&
    Date.now() - b.emailStatusUpdatedAt.getTime() < FOURTEEN_DAYS_MS &&
    b.emailStatus !== 'unverified'
  ) {
    return {
      step: 'email',
      status: 'skipped',
      summary: { reason: 'Recent scrape poging', emailStatus: b.emailStatus },
    };
  }

  if (!b.website) {
    await db
      .update(schema.businesses)
      .set({
        emailSource: 'none',
        emailStatus: 'unverified',
        emailStatusUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.businesses.id, b.id));
    return { step: 'email', status: 'ok', summary: { email: null, reason: 'Geen website' } };
  }

  try {
    const r = await findContactEmail({ website: b.website, businessName: b.name });
    if (r.costEur > 0) {
      await trackAiCost({
        endpoint: '/api/enrich/full/[id]:email',
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        costEur: r.costEur,
        businessId: b.id,
      });
    }

    const emailStatus = r.mxValid === true ? 'mx_valid' : r.mxValid === false ? 'invalid' : 'unverified';
    await db
      .update(schema.businesses)
      .set({
        email: r.email ?? b.email,
        emailSource: r.email ? 'firecrawl' : 'none',
        emailStatus,
        emailStatusUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.businesses.id, b.id));

    return {
      step: 'email',
      status: 'ok',
      summary: {
        email: r.email,
        generic: r.generic,
        mxValid: r.mxValid,
        confidence: r.confidence,
      },
    };
  } catch (err) {
    await logDlq(b.id, 'email', err);
    return { step: 'email', status: 'failed', summary: { error: (err as Error).message } };
  }
}

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

async function markDisqualified(businessId: string, reason: string) {
  // Bestaande leadScores.disqualified flag hijacken — simpel, bestaat al.
  const [existing] = await db
    .select()
    .from(schema.leadScores)
    .where(eq(schema.leadScores.businessId, businessId))
    .limit(1);

  if (existing) {
    await db
      .update(schema.leadScores)
      .set({ disqualified: true, disqualifyReason: reason })
      .where(eq(schema.leadScores.businessId, businessId));
  } else {
    await db.insert(schema.leadScores).values({
      businessId,
      totalScore: 0,
      disqualified: true,
      disqualifyReason: reason,
    });
  }
}

async function logDlq(
  businessId: string,
  step: 'qualify' | 'website' | 'email' | 'generate',
  err: unknown,
) {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await db.insert(schema.dlqEnrichments).values({
      businessId,
      step,
      error: message.slice(0, 500),
      errorDetail: { stack: err instanceof Error ? err.stack?.slice(0, 2000) : null },
    });
  } catch (dbErr) {
    console.error('[enrich.full] DLQ insert faalde:', dbErr);
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
      emailStatus: schema.businesses.emailStatus,
      websiteVerdict: schema.businesses.websiteVerdict,
      chainClassification: schema.businesses.chainClassification,
      chainConfidence: schema.businesses.chainConfidence,
      kboEnterpriseNumber: schema.businesses.kboEnterpriseNumber,
    })
    .from(schema.businesses)
    .where(eq(schema.businesses.id, id))
    .limit(1);
  if (!b) return NextResponse.json({ error: 'business niet gevonden' }, { status: 404 });
  return NextResponse.json(b);
}
