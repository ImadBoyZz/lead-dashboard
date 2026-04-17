// KBO matcher: gegeven een business (naam + postcode), zoek het KBO enterprise
// in kbo_lookup (consolidated tabel, plan §Quota fix).
//
// Strategie (tiered, early-exit):
//   1. Exact match op (normalized_denomination, zipcode) → confidence 1.0
//   2. Fuzzy pg_trgm similarity ≥ 0.85 in zelfde zipcode → confidence 0.85-0.99
//   3. > 1 unieke hit op beide tiers → ambiguous, return null (nooit gokken)
//
// Reden voor fuzzy tier: exact recall bleef rond 30-46%. Plan §BESLISPUNT.

import { and, eq, sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { normalizeBusinessName, normalizePostcode } from './normalize';

export interface KboMatchInput {
  name: string;
  postalCode: string | null | undefined;
}

export interface KboMatchResult {
  enterpriseNumber: string;
  foundedDate: string | null;
  naceCode: string | null;
  legalForm: string | null;
  juridicalSituation: string | null;
  confidence: number;
  matchStrategy: 'exact' | 'fuzzy';
}

const FUZZY_SIMILARITY_THRESHOLD = 0.85;
const MIN_FUZZY_LENGTH = 6; // voorkomt false positives op korte namen ("Auto", "Bakker")

/**
 * Exact + fuzzy match. Fuzzy alleen als exact 0 hits heeft.
 * Skip altijd als meerdere unieke hits (ambiguous).
 */
export async function matchKboEnterprise(
  input: KboMatchInput,
): Promise<KboMatchResult | null> {
  const normalized = normalizeBusinessName(input.name);
  const zip = normalizePostcode(input.postalCode);
  if (!normalized || !zip) return null;

  // Tier 1: exact match
  const exactRows = await db
    .select({
      enterpriseNumber: schema.kboLookup.enterpriseNumber,
      naceCode: schema.kboLookup.naceCode,
      juridicalForm: schema.kboLookup.juridicalForm,
      juridicalSituation: schema.kboLookup.juridicalSituation,
      startDate: schema.kboLookup.startDate,
    })
    .from(schema.kboLookup)
    .where(
      and(
        eq(schema.kboLookup.normalizedDenomination, normalized),
        eq(schema.kboLookup.zipcode, zip),
      ),
    )
    .limit(5);

  if (exactRows.length === 1) {
    const [match] = exactRows;
    return {
      enterpriseNumber: match.enterpriseNumber,
      foundedDate: match.startDate ?? null,
      naceCode: match.naceCode ?? null,
      legalForm: match.juridicalForm ?? null,
      juridicalSituation: match.juridicalSituation ?? null,
      confidence: 1.0,
      matchStrategy: 'exact',
    };
  }
  if (exactRows.length > 1) return null; // exact ambiguous

  // Tier 2: fuzzy (pg_trgm similarity ≥ threshold, zelfde zipcode)
  if (normalized.length < MIN_FUZZY_LENGTH) return null;

  const fuzzyRows = await db.execute<{
    enterprise_number: string;
    nace_code: string | null;
    juridical_form: string | null;
    juridical_situation: string | null;
    start_date: string | null;
    similarity: number;
  }>(dsql`
    SELECT enterprise_number, nace_code, juridical_form, juridical_situation, start_date::text,
           similarity(normalized_denomination, ${normalized}) AS similarity
    FROM kbo_lookup
    WHERE zipcode = ${zip}
      AND normalized_denomination % ${normalized}
      AND similarity(normalized_denomination, ${normalized}) >= ${FUZZY_SIMILARITY_THRESHOLD}
    ORDER BY similarity DESC
    LIMIT 5
  `);

  const rows = fuzzyRows.rows ?? (fuzzyRows as unknown as typeof fuzzyRows.rows);
  if (!rows || rows.length === 0) return null;

  const top = rows[0];
  const second = rows[1];
  // Ambiguous: twee hits met zeer vergelijkbare similarity → kan niet uniek identificeren
  if (second && Math.abs(top.similarity - second.similarity) < 0.02) return null;

  return {
    enterpriseNumber: top.enterprise_number,
    foundedDate: top.start_date ?? null,
    naceCode: top.nace_code ?? null,
    legalForm: top.juridical_form ?? null,
    juridicalSituation: top.juridical_situation ?? null,
    confidence: Number(top.similarity.toFixed(3)),
    matchStrategy: 'fuzzy',
  };
}
