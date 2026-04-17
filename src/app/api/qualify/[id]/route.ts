// 4-laags franchise/keten classifier met early-exit + structured output defense.
// Plan: ik-wil-mijn-lead-purring-tome.md §Fase 2 /api/qualify/[id].
//
// Layer 1 = hardcoded patterns (gratis).
// Layer 2 = Google Places signalen (gratis).
// Layer 3 = Haiku naam-based classify (~€0,0005/lead).
// Layer 4 = Firecrawl scrape + Haiku (~€0,005/lead, ~30% doorstroom).
//
// Schrijft naar businesses.chainClassification + chainConfidence + chainReason.
// Respecteert cost-guard (hard fail bij budget exceed).
// Idempotent: skip als chainClassifiedAt < 30 dagen én confidence >= 0.85.

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import {
  classifyChainLayers1And2,
  type ClassifyResult,
  type ChainClassification,
} from '@/lib/classify/franchise';
import { classifyByName, classifyByScrape } from '@/lib/classify/llm-classifier';
import { scrapeUrlMarkdown, FIRECRAWL_SCRAPE_COST_EUR } from '@/lib/enrich/firecrawl';
import { assertBudgetAvailable, trackAiCost, BudgetExceededError } from '@/lib/cost-guard';
import { authenticateSessionOrBearer } from '@/lib/webhook-auth';

const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const IDEMPOTENCY_MS = 30 * 24 * 60 * 60 * 1000; // 30 dagen

interface LayerLog {
  layer: 'patterns' | 'places_signals' | 'llm_name' | 'llm_scrape';
  classification: ChainClassification;
  confidence: number;
  reason: string;
  costEur?: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticateSessionOrBearer(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: businessId } = await params;
  if (!businessId) {
    return NextResponse.json({ error: 'id ontbreekt' }, { status: 400 });
  }

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
      city: schema.businesses.city,
      naceDescription: schema.businesses.naceDescription,
      website: schema.businesses.website,
      googleReviewCount: schema.businesses.googleReviewCount,
      googlePlaceId: schema.businesses.googlePlaceId,
      hasGoogleBusinessProfile: schema.businesses.hasGoogleBusinessProfile,
      chainClassification: schema.businesses.chainClassification,
      chainConfidence: schema.businesses.chainConfidence,
      chainClassifiedAt: schema.businesses.chainClassifiedAt,
    })
    .from(schema.businesses)
    .where(eq(schema.businesses.id, businessId))
    .limit(1);

  if (!business) {
    return NextResponse.json({ error: 'business niet gevonden' }, { status: 404 });
  }

  // Idempotency: skip recente high-confidence verdicten.
  if (
    business.chainClassifiedAt &&
    business.chainConfidence !== null &&
    business.chainConfidence >= HIGH_CONFIDENCE_THRESHOLD &&
    Date.now() - business.chainClassifiedAt.getTime() < IDEMPOTENCY_MS
  ) {
    return NextResponse.json({
      skipped: true,
      reason: `Recent geklasseerd met hoge confidence (${business.chainConfidence})`,
      classification: business.chainClassification,
      confidence: business.chainConfidence,
    });
  }

  const trail: LayerLog[] = [];

  // ── Layer 1 + 2 (gratis) ───────────────────────────────
  const l12 = await classifyChainLayers1And2({
    name: business.name,
    googleReviewCount: business.googleReviewCount,
    googlePlaceId: business.googlePlaceId,
    website: business.website,
    hasGoogleBusinessProfile: business.hasGoogleBusinessProfile,
  });
  trail.push({
    layer: l12.layerUsed,
    classification: l12.classification,
    confidence: l12.confidence,
    reason: l12.reason,
  });

  if (l12.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return await persistAndRespond(businessId, l12, trail);
  }

  // ── Layer 3 (Haiku naam-based) ─────────────────────────
  let bestSoFar: ClassifyResult = l12;
  try {
    const l3 = await classifyByName({
      name: business.name,
      city: business.city,
      naceDescription: business.naceDescription,
      googleReviewCount: business.googleReviewCount,
      hasGoogleBusinessProfile: business.hasGoogleBusinessProfile,
      website: business.website,
    });

    await trackAiCost({
      endpoint: '/api/qualify/[id]:layer3',
      provider: 'anthropic',
      model: l3.modelUsed,
      promptTokens: l3.promptTokens,
      completionTokens: l3.completionTokens,
      costEur: l3.costEur,
      businessId,
    });

    trail.push({
      layer: 'llm_name',
      classification: l3.classification,
      confidence: l3.confidence,
      reason: l3.reason,
      costEur: l3.costEur,
    });

    if (l3.confidence > bestSoFar.confidence) {
      bestSoFar = {
        classification: l3.classification,
        confidence: l3.confidence,
        reason: l3.reason,
        layerUsed: 'llm_name',
      };
    }

    if (l3.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
      return await persistAndRespond(businessId, bestSoFar, trail);
    }
  } catch (err) {
    console.error('[qualify] Layer 3 fout:', err);
    await logDlq(businessId, 'qualify', err);
    // Ga verder met layer 4 als website bestaat; anders return wat we hebben
  }

  // ── Layer 4 (scrape + Haiku) — alleen als website + budget ─────
  if (!business.website) {
    return await persistAndRespond(businessId, bestSoFar, trail);
  }

  try {
    const scraped = await scrapeUrlMarkdown(business.website, { timeoutMs: 20000 });
    if (!scraped || scraped.rawTextLen < 100) {
      trail.push({
        layer: 'llm_scrape',
        classification: 'unknown',
        confidence: 0,
        reason: 'Scrape leverde geen bruikbare content',
      });
      return await persistAndRespond(businessId, bestSoFar, trail);
    }

    const l4 = await classifyByScrape({
      name: business.name,
      website: business.website,
      scrapedText: scraped.markdown,
    });

    await trackAiCost({
      endpoint: '/api/qualify/[id]:layer4',
      provider: 'anthropic',
      model: l4.modelUsed,
      promptTokens: l4.promptTokens,
      completionTokens: l4.completionTokens,
      costEur: l4.costEur + FIRECRAWL_SCRAPE_COST_EUR,
      businessId,
    });

    trail.push({
      layer: 'llm_scrape',
      classification: l4.classification,
      confidence: l4.confidence,
      reason: l4.reason,
      costEur: l4.costEur + FIRECRAWL_SCRAPE_COST_EUR,
    });

    if (l4.confidence > bestSoFar.confidence) {
      bestSoFar = {
        classification: l4.classification,
        confidence: l4.confidence,
        reason: l4.reason,
        layerUsed: 'llm_scrape',
      };
    }
  } catch (err) {
    console.error('[qualify] Layer 4 fout:', err);
    await logDlq(businessId, 'qualify', err);
  }

  return await persistAndRespond(businessId, bestSoFar, trail);
}

async function persistAndRespond(
  businessId: string,
  result: ClassifyResult,
  trail: LayerLog[],
) {
  await db
    .update(schema.businesses)
    .set({
      chainClassification: result.classification,
      chainConfidence: result.confidence,
      chainReason: result.reason,
      chainClassifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.businesses.id, businessId));

  return NextResponse.json({
    businessId,
    classification: result.classification,
    confidence: result.confidence,
    reason: result.reason,
    layerUsed: result.layerUsed,
    trail,
  });
}

async function logDlq(businessId: string, step: 'qualify', err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await db.insert(schema.dlqEnrichments).values({
      businessId,
      step,
      error: message.slice(0, 500),
      errorDetail: { stack: err instanceof Error ? err.stack?.slice(0, 2000) : null },
    });
  } catch (dbErr) {
    console.error('[qualify] DLQ insert faalde:', dbErr);
  }
}

// GET: read-only verdict voor review UI
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticateSessionOrBearer(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: businessId } = await params;

  const [business] = await db
    .select({
      id: schema.businesses.id,
      name: schema.businesses.name,
      chainClassification: schema.businesses.chainClassification,
      chainConfidence: schema.businesses.chainConfidence,
      chainReason: schema.businesses.chainReason,
      chainClassifiedAt: schema.businesses.chainClassifiedAt,
    })
    .from(schema.businesses)
    .where(eq(schema.businesses.id, businessId))
    .limit(1);

  if (!business) {
    return NextResponse.json({ error: 'business niet gevonden' }, { status: 404 });
  }
  return NextResponse.json(business);
}
