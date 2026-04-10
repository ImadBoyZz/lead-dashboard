// Single source of truth voor provincie → steden mapping.
// Moet client-safe blijven: geen server-only imports.

export const PROVINCE_CITIES: Record<string, readonly string[]> = {
  'Oost-Vlaanderen': ['Gent', 'Aalst', 'Sint-Niklaas', 'Dendermonde', 'Oudenaarde', 'Wetteren', 'Lokeren', 'Eeklo', 'Geraardsbergen', 'Zele'],
  'Antwerpen':       ['Antwerpen', 'Mechelen', 'Turnhout', 'Lier', 'Herentals', 'Mol', 'Boom', 'Brasschaat'],
  'Vlaams-Brabant':  ['Leuven', 'Vilvoorde', 'Halle', 'Aarschot', 'Tienen', 'Diest'],
  'West-Vlaanderen': ['Brugge', 'Kortrijk', 'Oostende', 'Roeselare', 'Ieper', 'Waregem', 'Knokke-Heist'],
  'Limburg':         ['Hasselt', 'Genk', 'Sint-Truiden', 'Tongeren', 'Beringen', 'Lommel'],
  'Brussel':         ['Brussel'],
} as const;

export type ProvinceName = keyof typeof PROVINCE_CITIES;

export const PROVINCE_NAMES = Object.keys(PROVINCE_CITIES) as ProvinceName[];

// Known limitation: deze volgorde betekent dat bij lage target de loop
// kan stoppen voordat kleinere steden bezocht zijn (Gent heeft vaak al
// genoeg leads). Dat is intended: doel is snelste pad naar N leads,
// niet geografische spreiding.

export function isProvinceValue(value: string): boolean {
  return value.startsWith('province:');
}

export function parseProvinceValue(value: string): ProvinceName | null {
  if (!isProvinceValue(value)) return null;
  const name = value.slice('province:'.length) as ProvinceName;
  return PROVINCE_CITIES[name] ? name : null;
}
