// Layer 1: hardcoded franchise/keten-patronen voor Belgische KMO-markt.
// Word-boundary matching voorkomt false positives zoals "Frituur Van Jantje" → "Quick".
// Plan §critical files: `lib/classify/patterns.ts`.

import type { chainClassificationEnum } from '@/lib/db/schema';

type Classification = (typeof chainClassificationEnum.enumValues)[number];

export interface FranchisePattern {
  pattern: string;
  matchType: 'exact' | 'contains_word' | 'regex';
  classification: Classification;
  reason: string;
}

/**
 * Bekende Belgische ketens/franchises. Gebruikt als seed voor de `franchise_patterns`
 * tabel én als fallback wanneer de DB nog leeg is.
 *
 * Toegevoegd: horeca-fastfood ketens, tanken, supermarkt, uitzendbureaus,
 * bandenservice-ketens, kapperketens, winkelcentrum-gericht.
 */
export const SEED_FRANCHISE_PATTERNS: readonly FranchisePattern[] = [
  // Fastfood / horeca
  { pattern: 'McDonald', matchType: 'contains_word', classification: 'chain', reason: "McDonald's franchise" },
  { pattern: 'Burger King', matchType: 'contains_word', classification: 'chain', reason: 'Burger King franchise' },
  { pattern: 'KFC', matchType: 'contains_word', classification: 'chain', reason: 'KFC franchise' },
  { pattern: 'Quick', matchType: 'contains_word', classification: 'chain', reason: 'Quick franchise' },
  { pattern: 'Subway', matchType: 'contains_word', classification: 'chain', reason: 'Subway franchise' },
  { pattern: 'Pizza Hut', matchType: 'contains_word', classification: 'chain', reason: 'Pizza Hut franchise' },
  { pattern: "Domino's", matchType: 'contains_word', classification: 'chain', reason: "Domino's franchise" },
  { pattern: 'Starbucks', matchType: 'contains_word', classification: 'corporate', reason: 'Starbucks corporate' },
  { pattern: 'Panos', matchType: 'contains_word', classification: 'chain', reason: 'Panos franchise' },
  { pattern: 'Le Pain Quotidien', matchType: 'contains_word', classification: 'chain', reason: 'Le Pain Quotidien keten' },
  { pattern: 'Exki', matchType: 'contains_word', classification: 'chain', reason: 'Exki keten' },

  // Supermarkten
  { pattern: 'Colruyt', matchType: 'contains_word', classification: 'corporate', reason: 'Colruyt Group' },
  { pattern: 'Delhaize', matchType: 'contains_word', classification: 'corporate', reason: 'Delhaize' },
  { pattern: 'Carrefour', matchType: 'contains_word', classification: 'corporate', reason: 'Carrefour' },
  { pattern: 'Lidl', matchType: 'contains_word', classification: 'corporate', reason: 'Lidl' },
  { pattern: 'Aldi', matchType: 'contains_word', classification: 'corporate', reason: 'Aldi' },
  { pattern: 'Spar', matchType: 'contains_word', classification: 'chain', reason: 'Spar franchise' },
  { pattern: 'Proxy Delhaize', matchType: 'contains_word', classification: 'chain', reason: 'Proxy Delhaize franchise' },
  { pattern: 'Okay', matchType: 'exact', classification: 'chain', reason: 'Okay franchise (Colruyt)' },
  { pattern: 'Intermarché', matchType: 'contains_word', classification: 'chain', reason: 'Intermarché' },
  { pattern: 'Albert Heijn', matchType: 'contains_word', classification: 'corporate', reason: 'Albert Heijn' },

  // Tanken
  { pattern: 'Total', matchType: 'contains_word', classification: 'corporate', reason: 'TotalEnergies' },
  { pattern: 'TotalEnergies', matchType: 'contains_word', classification: 'corporate', reason: 'TotalEnergies' },
  { pattern: 'Shell', matchType: 'contains_word', classification: 'corporate', reason: 'Shell' },
  { pattern: 'Esso', matchType: 'contains_word', classification: 'corporate', reason: 'Esso/ExxonMobil' },
  { pattern: 'Q8', matchType: 'contains_word', classification: 'corporate', reason: 'Q8' },
  { pattern: 'BP', matchType: 'contains_word', classification: 'corporate', reason: 'BP' },
  { pattern: 'Texaco', matchType: 'contains_word', classification: 'corporate', reason: 'Texaco' },
  { pattern: 'Lukoil', matchType: 'contains_word', classification: 'corporate', reason: 'Lukoil' },
  { pattern: 'Octa\\+', matchType: 'regex', classification: 'chain', reason: 'Octa+ franchise' },
  { pattern: 'Dats 24', matchType: 'contains_word', classification: 'corporate', reason: 'Dats 24 (Colruyt)' },

  // Bandenservice / auto
  { pattern: 'Euromaster', matchType: 'contains_word', classification: 'chain', reason: 'Euromaster banden' },
  { pattern: 'First Stop', matchType: 'contains_word', classification: 'chain', reason: 'First Stop banden' },
  { pattern: 'Feu Vert', matchType: 'contains_word', classification: 'chain', reason: 'Feu Vert' },
  { pattern: 'Norauto', matchType: 'contains_word', classification: 'chain', reason: 'Norauto' },
  { pattern: 'Midas', matchType: 'contains_word', classification: 'chain', reason: 'Midas' },
  { pattern: 'Carglass', matchType: 'contains_word', classification: 'corporate', reason: 'Carglass' },
  { pattern: "O'Cool", matchType: 'contains_word', classification: 'chain', reason: "O'Cool franchise" },

  // Kappers / beauty
  { pattern: 'Franck Provost', matchType: 'contains_word', classification: 'chain', reason: 'Franck Provost kappersketen' },
  { pattern: 'Jean Louis David', matchType: 'contains_word', classification: 'chain', reason: 'Jean Louis David kappersketen' },
  { pattern: 'Tchip', matchType: 'contains_word', classification: 'chain', reason: 'Tchip kappersketen' },

  // Uitzendbureaus
  { pattern: 'Randstad', matchType: 'contains_word', classification: 'corporate', reason: 'Randstad' },
  { pattern: 'Adecco', matchType: 'contains_word', classification: 'corporate', reason: 'Adecco' },
  { pattern: 'Tempo-Team', matchType: 'contains_word', classification: 'corporate', reason: 'Tempo-Team' },
  { pattern: 'Manpower', matchType: 'contains_word', classification: 'corporate', reason: 'Manpower' },
  { pattern: 'Accent Jobs', matchType: 'contains_word', classification: 'corporate', reason: 'Accent Jobs' },
  { pattern: 'USG People', matchType: 'contains_word', classification: 'corporate', reason: 'USG People' },

  // Winkels / DIY
  { pattern: 'Brico', matchType: 'contains_word', classification: 'corporate', reason: 'Brico' },
  { pattern: 'Hubo', matchType: 'contains_word', classification: 'chain', reason: 'Hubo franchise' },
  { pattern: 'Gamma', matchType: 'contains_word', classification: 'chain', reason: 'Gamma franchise' },
  { pattern: 'Action', matchType: 'exact', classification: 'corporate', reason: 'Action non-food' },
  { pattern: 'Hema', matchType: 'contains_word', classification: 'corporate', reason: 'Hema' },
  { pattern: 'JBC', matchType: 'contains_word', classification: 'corporate', reason: 'JBC kleding' },
  { pattern: 'ZEB', matchType: 'exact', classification: 'corporate', reason: 'ZEB kleding' },
  { pattern: 'Zara', matchType: 'exact', classification: 'corporate', reason: 'Zara Inditex' },
  { pattern: 'H&M', matchType: 'contains_word', classification: 'corporate', reason: 'H&M' },
  { pattern: 'C&A', matchType: 'contains_word', classification: 'corporate', reason: 'C&A' },
  { pattern: 'MediaMarkt', matchType: 'contains_word', classification: 'corporate', reason: 'MediaMarkt' },
  { pattern: 'Krëfel', matchType: 'contains_word', classification: 'corporate', reason: 'Krëfel' },

  // Telecom
  { pattern: 'Proximus', matchType: 'contains_word', classification: 'corporate', reason: 'Proximus' },
  { pattern: 'Orange', matchType: 'exact', classification: 'corporate', reason: 'Orange' },
  { pattern: 'Telenet', matchType: 'contains_word', classification: 'corporate', reason: 'Telenet' },
  { pattern: 'Base', matchType: 'exact', classification: 'corporate', reason: 'Base' },

  // Banken / verzekeringen (meestal franchise-makelaar structuur)
  { pattern: 'KBC', matchType: 'contains_word', classification: 'corporate', reason: 'KBC' },
  { pattern: 'BNP Paribas', matchType: 'contains_word', classification: 'corporate', reason: 'BNP Paribas Fortis' },
  { pattern: 'ING', matchType: 'exact', classification: 'corporate', reason: 'ING België' },
  { pattern: 'Belfius', matchType: 'contains_word', classification: 'corporate', reason: 'Belfius' },
  { pattern: 'AXA', matchType: 'contains_word', classification: 'corporate', reason: 'AXA' },
  { pattern: 'DKV', matchType: 'contains_word', classification: 'corporate', reason: 'DKV' },

  // Logistiek / post
  { pattern: 'bpost', matchType: 'contains_word', classification: 'corporate', reason: 'bpost' },
  { pattern: 'DHL', matchType: 'contains_word', classification: 'corporate', reason: 'DHL' },
  { pattern: 'GLS', matchType: 'exact', classification: 'corporate', reason: 'GLS' },

  // Woonwinkels
  { pattern: 'IKEA', matchType: 'contains_word', classification: 'corporate', reason: 'IKEA' },
  { pattern: 'Mondial Relay', matchType: 'contains_word', classification: 'corporate', reason: 'Mondial Relay' },
] as const;

/**
 * Compile een pattern naar een matcher. Word-boundary voor contains_word voorkomt
 * dat "Frituur Smulpaap" matcht op "Paap" (tenzij expliciet regex opgegeven).
 */
export function compilePattern(p: { pattern: string; matchType: FranchisePattern['matchType'] }): RegExp {
  switch (p.matchType) {
    case 'exact':
      return new RegExp(`^\\s*${escapeRegex(p.pattern)}\\s*$`, 'i');
    case 'contains_word':
      return new RegExp(`\\b${escapeRegex(p.pattern)}\\b`, 'i');
    case 'regex':
      return new RegExp(p.pattern, 'i');
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface PatternMatch {
  classification: Classification;
  reason: string;
  matched: string;
}

/**
 * Test een bedrijfsnaam tegen een set patronen. Returnt eerste match of null.
 */
export function matchPatterns(
  businessName: string,
  patterns: readonly FranchisePattern[] = SEED_FRANCHISE_PATTERNS,
): PatternMatch | null {
  const trimmed = businessName.trim();
  if (!trimmed) return null;
  for (const p of patterns) {
    const re = compilePattern(p);
    if (re.test(trimmed)) {
      return { classification: p.classification, reason: p.reason, matched: p.pattern };
    }
  }
  return null;
}
