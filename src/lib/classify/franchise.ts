// 4-laags franchise/keten classifier. Layer 1+2 zijn "gratis" (pattern + bestaande
// Google Places signalen). Layer 3+4 (LLM + scrape+LLM) komen in Fase 2.
// Plan §critical files: `lib/classify/franchise.ts`.
//
// Design keuze: early-exit zodra een laag confident (>=0.85) classify oplevert.
// Bespaart ~70% van de LLM-kosten op Layer 3-4 volgens plan kostenraming.

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { matchPatterns, SEED_FRANCHISE_PATTERNS, type FranchisePattern } from './patterns';

export type ChainClassification = (typeof schema.chainClassificationEnum.enumValues)[number];

export interface ClassifyInput {
  name: string;
  googleReviewCount: number | null;
  googlePlaceId: string | null;
  website: string | null;
  hasGoogleBusinessProfile: boolean | null;
}

export interface ClassifyResult {
  classification: ChainClassification;
  confidence: number;
  reason: string;
  layerUsed: 'patterns' | 'places_signals' | 'llm_name' | 'llm_scrape';
}

const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const CHAIN_REVIEW_COUNT_THRESHOLD = 500;

/**
 * Layer 1 (patterns) + Layer 2 (Google Places signalen).
 * Laadt franchise_patterns uit DB; valt terug op SEED_FRANCHISE_PATTERNS.
 *
 * Returnt altijd een verdict — ook 'unknown' met confidence 0 als niks matcht.
 * Caller beslist of er doorgegaan wordt naar Layer 3-4 (LLM).
 */
export async function classifyChainLayers1And2(
  input: ClassifyInput,
): Promise<ClassifyResult> {
  // Layer 1: pattern match tegen DB + seed
  const patterns = await loadPatterns();
  const patternHit = matchPatterns(input.name, patterns);
  if (patternHit) {
    return {
      classification: patternHit.classification,
      confidence: 0.95,
      reason: `Pattern match: "${patternHit.matched}" — ${patternHit.reason}`,
      layerUsed: 'patterns',
    };
  }

  // Layer 2: Google Places signalen
  const places = classifyByPlacesSignals(input);
  if (places.confidence >= HIGH_CONFIDENCE_THRESHOLD) return places;

  // Geen sterke signalen — overlaat aan Layer 3+ (Fase 2)
  return {
    classification: 'unknown',
    confidence: 0,
    reason: 'Geen pattern match, geen sterke Places signalen',
    layerUsed: 'places_signals',
  };
}

function classifyByPlacesSignals(input: ClassifyInput): ClassifyResult {
  const reviews = input.googleReviewCount ?? 0;

  // Zeer hoog review count = bijna zeker keten/corporate vestiging
  if (reviews >= CHAIN_REVIEW_COUNT_THRESHOLD) {
    return {
      classification: 'chain',
      confidence: 0.9,
      reason: `${reviews} Google reviews (boven ketendrempel ${CHAIN_REVIEW_COUNT_THRESHOLD})`,
      layerUsed: 'places_signals',
    };
  }

  // Sterk aanwezig (GBP + website + 50-500 reviews) = onafhankelijk professioneel
  if (
    input.hasGoogleBusinessProfile &&
    input.website &&
    reviews >= 50 &&
    reviews < CHAIN_REVIEW_COUNT_THRESHOLD
  ) {
    return {
      classification: 'independent',
      confidence: 0.7,  // niet hoog genoeg voor early-exit, Layer 3 kan nog overrulen
      reason: `GBP + website + ${reviews} reviews — profiel van onafhankelijke KMO`,
      layerUsed: 'places_signals',
    };
  }

  return {
    classification: 'unknown',
    confidence: 0,
    reason: 'Places signalen zwak',
    layerUsed: 'places_signals',
  };
}

let patternCache: { loadedAt: number; patterns: FranchisePattern[] } | null = null;
const PATTERN_CACHE_TTL_MS = 5 * 60 * 1000;

async function loadPatterns(): Promise<FranchisePattern[]> {
  const now = Date.now();
  if (patternCache && now - patternCache.loadedAt < PATTERN_CACHE_TTL_MS) {
    return patternCache.patterns;
  }

  try {
    const rows = await db
      .select({
        pattern: schema.franchisePatterns.pattern,
        matchType: schema.franchisePatterns.matchType,
        classification: schema.franchisePatterns.classification,
        reason: schema.franchisePatterns.reason,
      })
      .from(schema.franchisePatterns)
      .where(eq(schema.franchisePatterns.enabled, true));

    const dbPatterns: FranchisePattern[] = rows.map((r) => ({
      pattern: r.pattern,
      matchType: r.matchType,
      classification: r.classification,
      reason: r.reason ?? '',
    }));

    const combined = dbPatterns.length > 0 ? dbPatterns : [...SEED_FRANCHISE_PATTERNS];
    patternCache = { loadedAt: now, patterns: combined };
    return combined;
  } catch {
    // DB niet beschikbaar of tabel nog leeg: val terug op seed
    return [...SEED_FRANCHISE_PATTERNS];
  }
}

/**
 * Invalide de in-memory pattern cache. Aanroepen na CRUD op franchise_patterns.
 */
export function invalidatePatternCache(): void {
  patternCache = null;
}

/**
 * Is deze classificatie een harde disqualifier voor cold outreach?
 * Keten / corporate / franchise = geen persoonlijke aankoop-beslissing ter plaatse.
 */
export function isChainDisqualifier(classification: ChainClassification): boolean {
  return classification === 'chain' || classification === 'corporate' || classification === 'franchise';
}
