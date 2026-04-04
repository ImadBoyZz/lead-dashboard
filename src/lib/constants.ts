export const LEAD_STATUS_OPTIONS = [
  { value: 'new', label: 'Nieuw', color: 'bg-blue-100 text-blue-700' },
  { value: 'contacted', label: 'Gecontacteerd', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'replied', label: 'Gereageerd', color: 'bg-purple-100 text-purple-700' },
  { value: 'meeting', label: 'Meeting', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'won', label: 'Gewonnen', color: 'bg-green-100 text-green-700' },
  { value: 'lost', label: 'Verloren', color: 'bg-red-100 text-red-700' },
  { value: 'disqualified', label: 'Gediskwalificeerd', color: 'bg-gray-100 text-gray-700' },
] as const;

export const COUNTRY_OPTIONS = [
  { value: 'BE', label: 'België' },
  { value: 'NL', label: 'Nederland' },
] as const;

export const BELGIAN_PROVINCES = [
  'Antwerpen', 'Limburg', 'Oost-Vlaanderen', 'West-Vlaanderen', 'Vlaams-Brabant',
  'Brussel', 'Waals-Brabant', 'Henegouwen', 'Luik', 'Luxemburg', 'Namen',
] as const;

export const DUTCH_PROVINCES = [
  'Drenthe', 'Flevoland', 'Friesland', 'Gelderland', 'Groningen',
  'Limburg', 'Noord-Brabant', 'Noord-Holland', 'Overijssel',
  'Utrecht', 'Zeeland', 'Zuid-Holland',
] as const;

// Common NACE codes for target sectors
export const TARGET_NACE_CODES = {
  'Horeca': ['5610', '5621', '5629', '5630', '5510', '5520'],
  'Retail': ['4711', '4719', '4721', '4751', '4759', '4771', '4772'],
  'Bouw': ['4110', '4120', '4211', '4221', '4291', '4311', '4321', '4322', '4329', '4331', '4332', '4333', '4334', '4339', '4391', '4399'],
  'Vastgoed': ['6810', '6820', '6831', '6832'],
  'Auto': ['4511', '4519', '4520', '4531', '4532', '4540'],
  'Vrije beroepen': ['6910', '6920', '7010', '7021', '7022', '7111', '7112', '7120', '8621', '8622', '8623', '8690'],
  'IT/Tech': ['6201', '6202', '6203', '6209', '6311', '6312'],
} as const;

export const ITEMS_PER_PAGE = 25;

export const SORT_OPTIONS = [
  { value: 'score', label: 'Score (hoog → laag)' },
  { value: 'name', label: 'Naam (A → Z)' },
  { value: 'city', label: 'Stad (A → Z)' },
  { value: 'founded', label: 'Oprichtingsdatum' },
  { value: 'recent', label: 'Recent toegevoegd' },
] as const;
