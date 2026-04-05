// ============================================================
// NACE Sector Configuration — 4-tier + blacklist systeem
// ============================================================

export type SectorTier = 'A' | 'B' | 'C' | 'D';

export const SECTOR_TIERS: Record<SectorTier, { name: string; score: number; prefixes: readonly string[] }> = {
  A: {
    name: 'Zichtbaarheidssectoren',
    score: 27,
    prefixes: [
      '56',    // Horeca (restaurants, cafes, catering, traiteurs)
      '9602',  // Kappers, schoonheidssalons
      '9604',  // Wellness, sauna
      '47',    // Detailhandel (bakkerijen, slagers, apotheken, optiek, juweliers)
      '45',    // Autohandel, garages
      '862',   // Huisartsen, tandartsen, specialisten
      '869',   // Kinesitherapie, paramedisch
      '931',   // Fitness, sportclubs
    ],
  },
  B: {
    name: 'Lokale diensten',
    score: 15,
    prefixes: [
      '41',    // Algemene bouw
      '42',    // Weg- en waterbouw
      '43',    // Gespecialiseerde bouw (HVAC, elektra, dakwerk, schilderwerk)
      '8130',  // Tuinaanleg
      '68',    // Vastgoed (makelaars, beheer)
      '8230',  // Evenementen, trouwplanners
      '55',    // Hotels, B&Bs, vakantiewoningen
      '75',    // Dierenartsen
    ],
  },
  C: {
    name: 'Professionele diensten',
    score: 13,
    prefixes: [
      '691',   // Advocaten, notarissen
      '692',   // Accountants, boekhouders
      '6920',  // Accountants (specifiek)
      '711',   // Architecten, ingenieurs
      '7420',  // Fotografen
      '7410',  // Interieurontwerp
      '8510',  // Kinderopvang (kleuterschool)
      '8520',  // Kinderopvang (basisonderwijs)
      '8891',  // Kinderopvang (kinderdagverblijf)
    ],
  },
  D: {
    name: 'B2B/overig',
    score: 5,
    prefixes: [
      '49',    // Transport — NOTE: 49 is also in blacklist for spoor/bus,
               //   but D-tier transport entries should use more specific prefixes
               //   if needed. Keeping for generic transport matching.
      '46',    // Groothandel
      '10',    // Voedingsproductie
      '25',    // Metaalproductie
      '310',   // Meubelmakers
      '9603',  // Begrafenisondernemingen
    ],
  },
} as const;

// Blacklist — nooit importeren
export const NACE_BLACKLIST_PREFIXES = [
  '62',    // IT/software (concurrenten)
  '63',    // Data/webhosting (concurrenten)
  '731',   // Reclamebureaus (concurrenten)
  '84',    // Overheid
  '94',    // Verenigingen/vakbonden
  '64', '65', '66',  // Financiele sector
  '01', '02', '03',  // Landbouw/visserij
  '7010',  // Holdings
  '61',    // Telecom (Proximus, Orange, Base)
  '35',    // Energie/elektriciteit (Engie, Luminus)
  '36',    // Watervoorziening (utilities)
  '53',    // Post/koerier (Bpost, DHL)
  '49',    // Spoor/busvervoer (NMBS, De Lijn)
  '51',    // Luchtvaart
] as const;

// Rechtsvorm codes
export const LEGAL_FORM_INCLUDE = ['014', '015', '016', '017', '018', '001'] as const;
export const LEGAL_FORM_EXCLUDE = ['027', '019'] as const;

// ============================================================
// Sector Review Medianen — verwacht aantal reviews per cluster
// ============================================================

export const SECTOR_REVIEW_MEDIANS: Record<string, { median: number; prefixes: string[] }> = {
  horeca_food: { median: 45, prefixes: ['56'] },
  beauty_wellness: { median: 25, prefixes: ['9602', '9604', '931'] },
  garage_auto: { median: 20, prefixes: ['45'] },
  retail: { median: 15, prefixes: ['47'] },
  bouw_ambacht: { median: 12, prefixes: ['41', '42', '43'] },
  juridisch_medisch: { median: 6, prefixes: ['691', '692', '862', '869'] },
};

const DEFAULT_MEDIAN_REVIEWS = 10;

// ============================================================
// Legacy exports for backwards compatibility
// ============================================================

// Tier A + B prefixes (maps to old tier 1)
export const NACE_TIER1_PREFIXES = [
  ...SECTOR_TIERS.A.prefixes,
  ...SECTOR_TIERS.B.prefixes,
] as const;

// Tier C + D prefixes (maps to old tier 2)
export const NACE_TIER2_PREFIXES = [
  ...SECTOR_TIERS.C.prefixes,
  ...SECTOR_TIERS.D.prefixes,
] as const;

// ============================================================
// Functions
// ============================================================

/**
 * Returns the full tier info for a NACE code.
 * Blacklisted codes return { tier: null, score: 0 }.
 */
export function getSectorTier(naceCode: string | null): { tier: SectorTier | null; score: number } {
  if (!naceCode) return { tier: null, score: 0 };

  // Check blacklist first
  if (NACE_BLACKLIST_PREFIXES.some(p => naceCode.startsWith(p))) {
    return { tier: null, score: 0 };
  }

  // Check tiers in order (A → D) — most specific prefix wins via startsWith
  const tierKeys: SectorTier[] = ['A', 'B', 'C', 'D'];
  for (const key of tierKeys) {
    const tierData = SECTOR_TIERS[key];
    if (tierData.prefixes.some(p => naceCode.startsWith(p))) {
      return { tier: key, score: tierData.score };
    }
  }

  return { tier: null, score: 0 };
}

/**
 * Returns median review count for the sector cluster this NACE code belongs to.
 * Falls back to DEFAULT_MEDIAN_REVIEWS (10) if no cluster matches.
 */
export function getSectorMedianReviews(naceCode: string | null): number {
  if (!naceCode) return DEFAULT_MEDIAN_REVIEWS;

  for (const cluster of Object.values(SECTOR_REVIEW_MEDIANS)) {
    if (cluster.prefixes.some(p => naceCode.startsWith(p))) {
      return cluster.median;
    }
  }

  return DEFAULT_MEDIAN_REVIEWS;
}

/**
 * Returns true for Tier A (zichtbaarheidssectoren).
 */
export function isZichtbaarheidsSector(naceCode: string | null): boolean {
  if (!naceCode) return false;
  return SECTOR_TIERS.A.prefixes.some(p => naceCode.startsWith(p));
}

/**
 * Backwards-compatible tier function.
 * Tier A and B → 1, Tier C and D → 2, Blacklist/unknown → null.
 */
export function getNaceTier(naceCode: string | null): 1 | 2 | null {
  if (!naceCode) return null;

  const { tier } = getSectorTier(naceCode);
  if (tier === 'A' || tier === 'B') return 1;
  if (tier === 'C' || tier === 'D') return 2;
  return null;
}

export function isNaceBlacklisted(naceCode: string | null): boolean {
  if (!naceCode) return false;
  return NACE_BLACKLIST_PREFIXES.some(p => naceCode.startsWith(p));
}

export function isLegalFormAllowed(legalForm: string | null): boolean {
  if (!legalForm) return true;
  if ((LEGAL_FORM_EXCLUDE as readonly string[]).includes(legalForm)) return false;
  return true;
}
