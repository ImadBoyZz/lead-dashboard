// Naam-normalisatie voor KBO ↔ Places matching.
// Plan: ik-heb-eigenlijk-een-merry-oasis.md §Chunk 2.
//
// Doel: twee namen die dezelfde entiteit beschrijven moeten identieke output
// geven. Belangrijkste transformaties:
//   - Lowercase, diacritics strippen
//   - Rechtsvorm-suffixen verwijderen (BV, BVBA, NV, SPRL, SA, VZW, ...)
//   - Algemene filler-woorden weghalen (& Co, & Zonen, en Zonen)
//   - Meervoudige spaties + punctuatie normaliseren
//
// Voorbeelden:
//   "Bakkerij De Witte BVBA"    → "bakkerij de witte"
//   "Bakkerij De Witte BV"      → "bakkerij de witte"
//   "Garage Janssens & Zonen"   → "garage janssens"
//   "JANSSENS & ZONEN BV"       → "janssens"
//   "Café 't Ankertje"          → "cafe t ankertje"

// "cv" opzettelijk NIET hier: in KMO-namen is "CV" overwhelmend "Centrale Verwarming"
// niet Coöperatieve Vennootschap. Overstrippen zou "Sanitair & CV Janssens" naar
// "sanitair janssens" maken, wat KBO-naam niet matcht.
const LEGAL_FORM_TOKENS = [
  // Belgische rechtsvormen (NL)
  'bv', 'bvba', 'nv', 'cvba', 'vof', 'vzw', 'commv', 'commanditaire',
  'eenmanszaak', 'ivzw', 'ebvba', 'srl', 'scrl',
  // Franse/Franstalige
  'sa', 'sprl', 'snc', 'scs', 'asbl', 'sarl',
  // Engels
  'ltd', 'inc', 'llc', 'corp', 'plc', 'gmbh',
];

const FILLER_PHRASES = [
  '& zonen',
  'en zonen',
  '& co',
  'et cie',
  '& cie',
  '& partners',
  'en partners',
  'and partners',
];

// Veel Places-vermeldingen hebben "BedrijfNaam STAD" als suffix. KBO heeft dat zelden.
// Strip bekende Vlaamse/Brusselse hoofdsteden en steden van >50k inwoners aan het EIND.
const LOCATION_SUFFIXES = new Set([
  'aalst', 'antwerpen', 'brugge', 'brussel', 'dendermonde', 'eeklo', 'genk', 'gent',
  'halle', 'hasselt', 'izegem', 'kortrijk', 'leuven', 'lier', 'lokeren', 'mechelen',
  'menen', 'mol', 'ninove', 'ostende', 'oostende', 'oudenaarde', 'roeselare',
  'ronse', 'sint niklaas', 'sint-niklaas', 'tienen', 'tongeren', 'turnhout',
  'vilvoorde', 'waregem', 'geraardsbergen', 'zottegem', 'wetteren',
]);

/**
 * Normaliseer een bedrijfsnaam voor matching.
 * Pure function — geen side effects.
 */
export function normalizeBusinessName(raw: string | null | undefined): string {
  if (!raw) return '';

  let s = raw.toLowerCase().trim();

  // Diacritics verwijderen: é → e, ü → u, etc.
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Filler-zinnen wegzagen (voor we rechtsvormen weghalen, omdat die soms gelinkt zijn)
  for (const phrase of FILLER_PHRASES) {
    s = s.replace(new RegExp(`\\s+${escapeRegex(phrase)}\\b`, 'g'), '');
  }

  // Rechtsvorm-afkortingen met punten normaliseren VÓÓR punctuatie-strip:
  // "B.V" → "bv", "B.V.B.A" → "bvba", "N.V" → "nv", "S.A" → "sa".
  // Zonder deze stap wordt "B.V" → "b v" (twee losse tokens).
  s = s.replace(/\b([a-z])\.([a-z])(?:\.([a-z]))?(?:\.([a-z]))?\b/g, (_m, a, b, c, d) =>
    [a, b, c, d].filter(Boolean).join(''),
  );

  // Punctuatie en speciale tekens → spatie (behalve apostrof in 't, 's, d')
  s = s.replace(/[^\p{L}\p{N}\s']/gu, ' ');

  // Apostrof losmaken: "'t Ankertje" → " t ankertje"
  s = s.replace(/'/g, ' ');

  // Rechtsvorm-suffixen weg. Match op woord-boundary zodat "bv" in "bvba" niet fout gaat.
  const tokens = s.split(/\s+/).filter((t) => t.length > 0);
  const filtered = tokens.filter((t) => !LEGAL_FORM_TOKENS.includes(t));

  // Location-suffix stripping: als laatste token een stadsnaam is EN er meer dan 1 token is.
  // Ook 2-woord stadsnamen ("sint niklaas") herkennen.
  if (filtered.length >= 2) {
    const last = filtered[filtered.length - 1];
    const lastTwo = filtered.slice(-2).join(' ');
    if (LOCATION_SUFFIXES.has(lastTwo)) filtered.splice(-2);
    else if (LOCATION_SUFFIXES.has(last)) filtered.pop();
  }

  return filtered.join(' ').trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Postal-code normalisatie: Belgische postcode is altijd 4 cijfers.
 * Strips spaties, forceert 4-char lengte met leading zeros.
 */
export function normalizePostcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return null;
  return digits.padStart(4, '0').slice(-4);
}

/**
 * Extraheer Belgische postcode uit een volledig adres-string.
 * Google Places address format: "Straat 5, 9300 Aalst, België"
 * Eerste 4-cijferige nummer in range 1000-9999.
 */
export function extractPostcodeFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const matches = address.match(/\b(\d{4})\b/g);
  if (!matches) return null;
  for (const m of matches) {
    const n = parseInt(m, 10);
    if (n >= 1000 && n <= 9999) return m;
  }
  return null;
}
