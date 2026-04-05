// ── Google Places Text Search Discovery Service ──────
// Enige leadbron voor het dashboard. Zoekt bedrijven per sector + stad.

// ── Sector configuratie ──────────────────────────────

export const SECTOR_CATEGORIES: Record<string, string[]> = {
  'beauty': ['kapper', 'schoonheidssalon', 'nagelstudio', 'barbershop', 'wellness spa sauna', 'yoga studio'],
  'horeca': ['restaurant', 'cafe bar', 'traiteur catering', 'bakkerij', 'foodtruck', 'B&B hotel'],
  'bouw': ['aannemer', 'loodgieter', 'elektricien', 'dakwerker', 'schilder', 'HVAC verwarming', 'tuinaannemer', 'schrijnwerker', 'vloerder tegelzetter'],
  'auto': ['garage autogarage', 'carwash', 'autohandel', 'bandencentrale', 'autoruiten'],
  'medisch': ['tandarts', 'huisarts', 'kinesist', 'osteopaat', 'podoloog', 'logopedist', 'psycholoog', 'dierenarts'],
  'vastgoed': ['immokantoor makelaar', 'syndicus', 'vastgoedbeheer', 'notaris'],
  'retail': ['bakker', 'slager', 'bloemist', 'optiek', 'juwelier', 'kledingwinkel boetiek', 'fietsenwinkel', 'apotheek'],
  'fitness': ['fitness sportschool', 'crossfit', 'personal trainer', 'dansschool', 'vechtsport'],
  'events': ['trouwplanner', 'DJ', 'catering'],
  'huisdieren': ['dierenarts', 'trimsalon', 'dierenpension'],
  'transport': ['verhuisfirma', 'koerier'],
  'onderwijs': ['rijschool', 'muziekschool', 'taleninstituut'],
};

// Alle sectoren als flat array voor UI dropdown
export const ALL_SECTORS = Object.entries(SECTOR_CATEGORIES).map(([key, subsectors]) => ({
  value: key,
  label: key.charAt(0).toUpperCase() + key.slice(1),
  subsectors,
}));

// ── Interfaces ───────────────────────────────────────

interface PlacesApiPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  photos?: unknown[];
  googleMapsUri?: string;
}

interface PlacesApiResponse {
  places?: PlacesApiPlace[];
}

export interface DiscoveredLead {
  placeId: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string;
  photosCount: number;
  googleMapsUri: string | null;
  hasWebsite: boolean;
  qualityScore: number;
}

// ── Mock data voor development ───────────────────────

const MOCK_LEADS: DiscoveredLead[] = [
  {
    placeId: 'mock_place_1',
    name: 'Kapsalon De Schaar',
    address: 'Molenstraat 12, 9300 Aalst, Belgium',
    phone: '+32 53 12 34 56',
    website: null,
    rating: 4.5,
    reviewCount: 87,
    businessStatus: 'OPERATIONAL',
    photosCount: 15,
    googleMapsUri: 'https://maps.google.com/?cid=mock1',
    hasWebsite: false,
    qualityScore: 85,
  },
  {
    placeId: 'mock_place_2',
    name: 'Barbershop The Cut',
    address: 'Nieuwstraat 45, 9300 Aalst, Belgium',
    phone: '+32 53 78 90 12',
    website: 'https://thecut-aalst.be',
    rating: 4.2,
    reviewCount: 42,
    businessStatus: 'OPERATIONAL',
    photosCount: 8,
    googleMapsUri: 'https://maps.google.com/?cid=mock2',
    hasWebsite: true,
    qualityScore: 62,
  },
  {
    placeId: 'mock_place_3',
    name: 'Hair Studio Vogue',
    address: 'Stationsstraat 78, 9300 Aalst, Belgium',
    phone: null,
    website: null,
    rating: 4.8,
    reviewCount: 156,
    businessStatus: 'OPERATIONAL',
    photosCount: 22,
    googleMapsUri: 'https://maps.google.com/?cid=mock3',
    hasWebsite: false,
    qualityScore: 92,
  },
  {
    placeId: 'mock_place_4',
    name: 'Salon Belle',
    address: 'Kapellestraat 3, 9300 Aalst, Belgium',
    phone: '+32 53 44 55 66',
    website: 'https://salon-belle.be',
    rating: 3.9,
    reviewCount: 23,
    businessStatus: 'OPERATIONAL',
    photosCount: 5,
    googleMapsUri: 'https://maps.google.com/?cid=mock4',
    hasWebsite: true,
    qualityScore: 48,
  },
  {
    placeId: 'mock_place_5',
    name: 'Kapper Jan',
    address: 'Gentsesteenweg 120, 9300 Aalst, Belgium',
    phone: '+32 53 11 22 33',
    website: null,
    rating: 4.1,
    reviewCount: 31,
    businessStatus: 'OPERATIONAL',
    photosCount: 3,
    googleMapsUri: 'https://maps.google.com/?cid=mock5',
    hasWebsite: false,
    qualityScore: 74,
  },
];

// ── Field mask voor Text Search ──────────────────────

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.photos',
  'places.googleMapsUri',
].join(',');

// ── Core functions ──────────────��────────────────────

export function buildSearchQuery(sector: string, city: string): string {
  // Gebruik de eerste subsector als primaire zoekterm
  const subsectors = SECTOR_CATEGORIES[sector];
  if (!subsectors || subsectors.length === 0) {
    return `${sector} ${city} België`;
  }
  // Eerste subsector is de meest representatieve
  return `${subsectors[0]} ${city}`;
}

function calculateQualityScore(place: PlacesApiPlace): number {
  let score = 0;

  // Reviews: hoe meer hoe beter (max 40pt)
  const reviews = place.userRatingCount ?? 0;
  if (reviews >= 50) score += 40;
  else if (reviews >= 20) score += 30;
  else if (reviews >= 10) score += 20;
  else if (reviews >= 5) score += 10;
  else if (reviews > 0) score += 5;

  // Rating: hoge rating = actief bedrijf (max 20pt)
  const rating = place.rating ?? 0;
  if (rating >= 4.5) score += 20;
  else if (rating >= 4.0) score += 15;
  else if (rating >= 3.5) score += 10;

  // Geen website = opportunity (max 25pt)
  if (!place.websiteUri) score += 25;

  // Foto's = actief bedrijf (max 15pt)
  const photos = place.photos?.length ?? 0;
  if (photos >= 10) score += 15;
  else if (photos >= 5) score += 10;
  else if (photos > 0) score += 5;

  return Math.min(score, 100);
}

export async function discoverLeads(
  query: string,
  maxResults: number = 20,
): Promise<{ leads: DiscoveredLead[]; fromMock: boolean }> {
  // Mock mode voor development
  if (process.env.GOOGLE_PLACES_MOCK === 'true') {
    console.log('[Places Discovery] Mock mode — returning fixture data');
    return { leads: MOCK_LEADS.slice(0, maxResults), fromMock: true };
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('[Places Discovery] GOOGLE_PLACES_API_KEY not set');
    return { leads: [], fromMock: false };
  }

  // Budget circuit breaker
  const maxCalls = parseInt(process.env.PLACES_API_MAX_CALLS ?? '250', 10);
  const callCount = globalCallCount++;
  if (callCount >= maxCalls) {
    console.error(`[Places Discovery] Budget limit reached (${maxCalls} calls). Set PLACES_API_MAX_CALLS to increase.`);
    return { leads: [], fromMock: false };
  }

  try {
    console.log(`[Places Discovery] Searching: "${query}" (call #${callCount + 1})`);

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: Math.min(maxResults, 20), // API limit is 20
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Places Discovery] API error ${response.status}:`, errorText);
      return { leads: [], fromMock: false };
    }

    const data: PlacesApiResponse = await response.json();

    if (!data.places || data.places.length === 0) {
      console.log('[Places Discovery] No results found');
      return { leads: [], fromMock: false };
    }

    const leads: DiscoveredLead[] = data.places
      // Kwaliteitsfilter: skip gesloten bedrijven en 0 reviews
      .filter((place) => {
        if (place.businessStatus === 'CLOSED_PERMANENTLY' || place.businessStatus === 'CLOSED_TEMPORARILY') {
          return false;
        }
        if ((place.userRatingCount ?? 0) === 0) {
          return false;
        }
        return true;
      })
      .map((place) => ({
        placeId: place.id,
        name: place.displayName?.text ?? 'Onbekend',
        address: place.formattedAddress ?? '',
        phone: place.nationalPhoneNumber ?? null,
        website: place.websiteUri ?? null,
        rating: place.rating ?? null,
        reviewCount: place.userRatingCount ?? null,
        businessStatus: place.businessStatus ?? 'OPERATIONAL',
        photosCount: place.photos?.length ?? 0,
        googleMapsUri: place.googleMapsUri ?? null,
        hasWebsite: !!place.websiteUri,
        qualityScore: calculateQualityScore(place),
      }))
      // Sorteer op kwaliteitsscore (hoogste eerst)
      .sort((a, b) => b.qualityScore - a.qualityScore);

    console.log(`[Places Discovery] Found ${leads.length} qualified leads from ${data.places.length} results`);
    return { leads, fromMock: false };
  } catch (error) {
    console.error('[Places Discovery] Request failed:', error);
    return { leads: [], fromMock: false };
  }
}

// In-memory call counter (reset per server restart)
// Voor productie: vervang door DB counter
let globalCallCount = 0;

export function getApiCallCount(): number {
  return globalCallCount;
}

export function resetApiCallCount(): void {
  globalCallCount = 0;
}
