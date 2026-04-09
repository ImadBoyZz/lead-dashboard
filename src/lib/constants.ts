export const LEAD_STATUS_OPTIONS = [
  { value: 'new', label: 'Nieuw', color: 'bg-blue-100 text-blue-700' },
  { value: 'contacted', label: 'Gecontacteerd', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'meeting', label: 'Afspraak', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'quote_sent', label: 'Offerte verstuurd', color: 'bg-purple-100 text-purple-700' },
  { value: 'won', label: 'Gewonnen', color: 'bg-green-100 text-green-700' },
  { value: 'ignored', label: 'Genegeerd', color: 'bg-gray-100 text-gray-700' },
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

// Target NACE codes — afgestemd op kernfocus sectoren
export const TARGET_NACE_CODES = {
  // Tier 1: Kernfocus
  'Installateurs': ['4321', '4322', '4329'],  // Elektra, sanitair/HVAC, overige installatie
  'Vastgoed': ['6810', '6820', '6831', '6832'],
  'Tandartsen': ['8621', '8623'],
  'Dakwerken': ['4391'],
  'Bouw': ['4110', '4120', '4211', '4311', '4331', '4332', '4333', '4334', '4339', '4399'],
  // Tier 2: Secundair
  'Auto': ['4511', '4519', '4520', '4531', '4532', '4540'],
  'Tuinaanleg': ['8130'],
  'Accountants': ['6920'],
  'Schilderwerk': ['4334'],
  'Ramen & Deuren': ['4332'],
} as const;

export const ITEMS_PER_PAGE = 25;

export const SORT_OPTIONS = [
  { value: 'name', label: 'Naam (A → Z)' },
  { value: 'city', label: 'Stad (A → Z)' },
  { value: 'founded', label: 'Oprichtingsdatum' },
  { value: 'recent', label: 'Recent toegevoegd' },
] as const;

export const PIPELINE_STAGE_OPTIONS = [
  { value: 'new', label: 'Nieuw', color: 'bg-blue-100 text-blue-700' },
  { value: 'contacted', label: 'Gecontacteerd', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'meeting', label: 'Afspraak', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'quote_sent', label: 'Offerte verstuurd', color: 'bg-purple-100 text-purple-700' },
  { value: 'won', label: 'Gewonnen', color: 'bg-green-100 text-green-700' },
  { value: 'ignored', label: 'Genegeerd', color: 'bg-gray-100 text-gray-700' },
] as const;

export const OUTREACH_CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email', icon: 'Mail' },
  { value: 'phone', label: 'Telefoon', icon: 'Phone' },
  { value: 'linkedin', label: 'LinkedIn', icon: 'Linkedin' },
  { value: 'whatsapp', label: 'WhatsApp', icon: 'MessageCircle' },
  { value: 'in_person', label: 'Persoonlijk', icon: 'Users' },
] as const;

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Laag', color: 'bg-gray-100 text-gray-600' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-600' },
  { value: 'high', label: 'Hoog', color: 'bg-orange-100 text-orange-600' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-600' },
] as const;
