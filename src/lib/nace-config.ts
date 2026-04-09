// ============================================================
// NACE Sector Configuration — 4-tier + blacklist systeem
// ============================================================

export type SectorTier = 'A' | 'B' | 'C' | 'D';

export const SECTOR_TIERS: Record<SectorTier, { name: string; score: number; prefixes: readonly string[] }> = {
  A: {
    name: 'Kernfocus',
    score: 27,
    prefixes: [
      '43',    // Gespecialiseerde bouw (installateurs, HVAC, elektra, dakwerk, loodgieters, schilderwerk)
      '68',    // Vastgoed (makelaars, beheer)
      '862',   // Tandartsen, specialisten
      '41',    // Algemene bouw, aannemers
    ],
  },
  B: {
    name: 'Secundaire sectoren',
    score: 15,
    prefixes: [
      '45',    // Autohandel, garages
      '8130',  // Tuinaanleg
      '692',   // Accountants, boekhouders
      '6920',  // Accountants (specifiek)
      '42',    // Weg- en waterbouw
    ],
  },
  C: {
    name: 'Lage prioriteit',
    score: 5,
    prefixes: [
      '56',    // Horeca — gedemoveerd: lage marges, hoog faillissementsrisico
      '9602',  // Kappers, schoonheidssalons — gratis tools domineren (Treatwell/Fresha)
      '9604',  // Wellness, sauna
      '47',    // Detailhandel
      '869',   // Kinesitherapie — te kleine ticket per patiënt
      '931',   // Fitness — ketens domineren
      '691',   // Advocaten, notarissen — extreem conservatief
      '711',   // Architecten, ingenieurs
      '7420',  // Fotografen
      '7410',  // Interieurontwerp
      '75',    // Dierenartsen
      '8230',  // Evenementen
      '55',    // Hotels, B&Bs
    ],
  },
  D: {
    name: 'B2B/overig',
    score: 2,
    prefixes: [
      '46',    // Groothandel
      '10',    // Voedingsproductie
      '25',    // Metaalproductie
      '310',   // Meubelmakers
      '9603',  // Begrafenisondernemingen
      '8510',  // Kinderopvang
      '8520',  // Kinderopvang
      '8891',  // Kinderopvang
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
  installateurs_bouw: { median: 12, prefixes: ['41', '42', '43'] },
  vastgoed: { median: 10, prefixes: ['68'] },
  tandartsen: { median: 8, prefixes: ['862'] },
  garage_auto: { median: 20, prefixes: ['45'] },
  accountants: { median: 6, prefixes: ['692', '6920'] },
  tuinaanleg: { median: 10, prefixes: ['8130'] },
  // Legacy clusters (voor bestaande data)
  horeca_food: { median: 45, prefixes: ['56'] },
  beauty_wellness: { median: 25, prefixes: ['9602', '9604', '931'] },
  retail: { median: 15, prefixes: ['47'] },
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
