// ── Google Places Text Search Discovery Service ──────
// Enige leadbron voor het dashboard. Zoekt bedrijven per sector + stad.

// ── Sector configuratie ──────────────────────────────

export const SECTOR_CATEGORIES: Record<string, string[]> = {
  // Bestaande sectoren
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
  // Nieuwe sectoren
  'schoonmaak': ['schoonmaakbedrijf', 'glazenwasser', 'industriële reiniging', 'gevelreiniging'],
  'juridisch': ['advocaat', 'advocatenkantoor', 'juridisch advies', 'bemiddelaar'],
  'financieel': ['boekhouder', 'accountant', 'belastingadviseur', 'financieel adviseur', 'verzekeringskantoor'],
  'marketing': ['reclamebureau', 'drukkerij', 'grafisch ontwerp', 'signalisatie', 'copywriter'],
  'fotografie': ['fotograaf', 'videograaf', 'fotostudio', 'drone fotografie'],
  'ict': ['IT support', 'computerwinkel', 'telefoonwinkel', 'GSM herstelling', 'telecom'],
  'interieur': ['interieurarchitect', 'meubelwinkel', 'keukenwinkel', 'badkamerwinkel', 'gordijnen raamdecoratie'],
  'tuin': ['tuincentrum', 'hovenier', 'boomverzorging', 'tuinaanleg', 'gazononderhoud'],
  'elektro': ['elektrowinkel', 'huishoudapparaten', 'witgoed reparatie'],
  'voeding': ['supermarkt', 'biowinkel', 'delicatessen', 'kaaswinkel', 'chocolatier'],
  'mode': ['naaiatelier', 'kleermaker', 'stomerij', 'wasserij', 'schoenmaker', 'lederhandel'],
  'sport': ['sportwinkel', 'golfclub', 'tennisclub', 'zwembad', 'bowlingbaan', 'trampoline park'],
  'cultuur': ['bioscoop', 'theater', 'museum', 'escape room', 'speelhal'],
  'drukwerk': ['drukkerij', 'printshop', 'copy center', 'zeefdruk', 'stickers'],
  'beveiliging': ['beveiligingsbedrijf', 'alarmsystemen', 'camerabewaking', 'slotenmaker'],
  'energie': ['zonnepanelen', 'warmtepomp', 'airco installatie', 'energieadvies', 'laadpaal'],
  'landbouw': ['hoeve', 'boerderij', 'tuinbouw', 'landbouwmachines', 'loonwerk'],
  'water': ['zwembad bouw', 'zwembad onderhoud', 'waterbehandeling', 'spa installatie'],
  'kinderopvang': ['crèche', 'kinderopvang', 'naschoolse opvang', 'babysit service'],
  'ouderenzorg': ['thuiszorg', 'woonzorgcentrum', 'seniorenhulp', 'mantelzorg'],
  'apotheek': ['apotheek', 'orthopediewinkel', 'hoortoestel', 'optiek', 'diëtist'],
  'hout': ['timmerman', 'meubelmaker', 'houthandel', 'parketvloer'],
  'metaal': ['lasser', 'metaalbewerking', 'smederij', 'hekwerk', 'poortinstallatie'],
  'schilderwerk': ['schilder', 'behanger', 'decorateur', 'pleisterwerk'],
  'dakwerken': ['dakwerker', 'dakgoot', 'zinkwerker', 'dakrenovatie'],
  'ramen': ['ramen en deuren', 'schrijnwerkerij', 'rolluiken', 'zonwering', 'veranda'],
  'verhuur': ['autoverhuur', 'materiaalhuur', 'feestmateriaal', 'containerpark'],
  'tattoo': ['tattoo shop', 'piercing studio', 'permanent make-up'],
  'muziek': ['muziekwinkel', 'muziekinstrumenten', 'piano stemmer', 'DJ service'],
  'reizen': ['reisbureau', 'touroperator', 'vakantiewoning', 'camping'],
  'begrafenis': ['begrafenisondernemer', 'uitvaartcentrum', 'crematorium'],
  'bloemen': ['bloemist', 'bloemenwinkel', 'plantenwinkel', 'bloemstuk'],
  'moskee': ['moskee', 'islamitisch centrum', 'gebedsruimte', 'moslim gemeenschap'],
  'agency': ['uitzendbureau', 'interim kantoor', 'rekruteringsbureau', 'werving selectie', 'payroll dienst'],
};

const SECTOR_LABELS: Record<string, string> = {
  beauty: 'Beauty & Wellness', horeca: 'Horeca', bouw: 'Bouw & Ambacht', auto: 'Auto',
  medisch: 'Medisch', vastgoed: 'Vastgoed', retail: 'Retail', fitness: 'Fitness',
  events: 'Events', huisdieren: 'Huisdieren', transport: 'Transport', onderwijs: 'Onderwijs',
  schoonmaak: 'Schoonmaak', juridisch: 'Juridisch', financieel: 'Financieel',
  marketing: 'Marketing & Reclame', fotografie: 'Fotografie & Video', ict: 'ICT & Telecom',
  interieur: 'Interieur & Design', tuin: 'Tuin & Groen', elektro: 'Elektro & Huishoud',
  voeding: 'Voedingswinkel', mode: 'Mode & Textiel', sport: 'Sport & Recreatie',
  cultuur: 'Cultuur & Entertainment', drukwerk: 'Drukwerk & Print', beveiliging: 'Beveiliging',
  energie: 'Energie & Installatie', landbouw: 'Landbouw & Tuinbouw', water: 'Water & Zwembad',
  kinderopvang: 'Kinderopvang', ouderenzorg: 'Ouderenzorg', apotheek: 'Apotheek & Gezondheid',
  hout: 'Hout & Meubel', metaal: 'Metaal & Lassen', schilderwerk: 'Schilder & Decoratie',
  dakwerken: 'Dakwerken', ramen: 'Ramen & Deuren', verhuur: 'Verhuur',
  tattoo: 'Tattoo & Piercing', muziek: 'Muziek', reizen: 'Reizen & Toerisme',
  begrafenis: 'Uitvaart', bloemen: 'Bloemen & Planten', moskee: 'Moskee', agency: 'Agency',
};

// Alle sectoren als flat array voor UI dropdowns
export const ALL_SECTORS = Object.keys(SECTOR_CATEGORIES)
  .map((key) => ({
    value: key,
    label: SECTOR_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1),
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

// ── Stad coördinaten voor locationBias ──────────────

interface CityGeoData {
  lat: number;
  lng: number;
  radius: number; // meters
}

export const CITY_COORDINATES: Record<string, CityGeoData> = {
  // Oost-Vlaanderen
  'Gent':             { lat: 51.0543, lng: 3.7174,  radius: 15000 },
  'Aalst':            { lat: 50.9375, lng: 4.0400,  radius: 15000 },
  'Sint-Niklaas':     { lat: 51.1565, lng: 4.1440,  radius: 15000 },
  'Dendermonde':      { lat: 51.0280, lng: 4.1014,  radius: 12000 },
  'Oudenaarde':       { lat: 50.8459, lng: 3.6048,  radius: 12000 },
  'Wetteren':         { lat: 51.0042, lng: 3.8818,  radius: 10000 },
  'Lokeren':          { lat: 51.1034, lng: 3.9901,  radius: 12000 },
  'Eeklo':            { lat: 51.1870, lng: 3.5571,  radius: 12000 },
  'Geraardsbergen':   { lat: 50.7729, lng: 3.8778,  radius: 12000 },
  'Zele':             { lat: 51.0672, lng: 4.0400,  radius: 10000 },
  // Antwerpen
  'Antwerpen':        { lat: 51.2194, lng: 4.4025,  radius: 18000 },
  'Mechelen':         { lat: 51.0259, lng: 4.4776,  radius: 15000 },
  'Turnhout':         { lat: 51.3227, lng: 4.9483,  radius: 15000 },
  'Lier':             { lat: 51.1309, lng: 4.5700,  radius: 12000 },
  'Herentals':        { lat: 51.1764, lng: 4.8335,  radius: 12000 },
  'Mol':              { lat: 51.1895, lng: 5.1182,  radius: 12000 },
  'Boom':             { lat: 51.0891, lng: 4.3691,  radius: 10000 },
  'Brasschaat':       { lat: 51.2928, lng: 4.4924,  radius: 10000 },
  // Vlaams-Brabant
  'Leuven':           { lat: 50.8798, lng: 4.7005,  radius: 15000 },
  'Vilvoorde':        { lat: 50.9281, lng: 4.4280,  radius: 12000 },
  'Halle':            { lat: 50.7335, lng: 4.2349,  radius: 12000 },
  'Aarschot':         { lat: 50.9867, lng: 4.8303,  radius: 12000 },
  'Tienen':           { lat: 50.8076, lng: 4.9375,  radius: 12000 },
  'Diest':            { lat: 50.9894, lng: 5.0506,  radius: 12000 },
  // West-Vlaanderen
  'Brugge':           { lat: 51.2093, lng: 3.2247,  radius: 15000 },
  'Kortrijk':         { lat: 50.8273, lng: 3.2646,  radius: 15000 },
  'Oostende':         { lat: 51.2154, lng: 2.9286,  radius: 12000 },
  'Roeselare':        { lat: 50.9464, lng: 3.1246,  radius: 12000 },
  'Ieper':            { lat: 50.8517, lng: 2.8860,  radius: 12000 },
  'Waregem':          { lat: 50.8768, lng: 3.4275,  radius: 12000 },
  'Knokke-Heist':     { lat: 51.3502, lng: 3.2867,  radius: 10000 },
  // Limburg
  'Hasselt':          { lat: 50.9307, lng: 5.3375,  radius: 15000 },
  'Genk':             { lat: 50.9654, lng: 5.5024,  radius: 15000 },
  'Sint-Truiden':     { lat: 50.8161, lng: 5.1870,  radius: 12000 },
  'Tongeren':         { lat: 50.7807, lng: 5.4646,  radius: 12000 },
  'Beringen':         { lat: 51.0496, lng: 5.2262,  radius: 12000 },
  'Lommel':           { lat: 51.2316, lng: 5.3134,  radius: 12000 },
  // Brussel
  'Brussel':          { lat: 50.8503, lng: 4.3517,  radius: 15000 },
};

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
  nextPageToken?: string;
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
  chainWarning: string | null; // reden waarom dit mogelijk een keten is, null = geen warning
}

// ── Keten-detectie ───────────────────────────────────

// Bekende Belgische ketendomeinen (auto-skip bij import)
const CHAIN_DOMAIN_BLOCKLIST = [
  'midas.be', 'kreatos.be', 'hair-ici.be', 'ad-automotive.be', 'carglass.be',
  'kwikfit.be', 'euromaster.be', 'norauto.be', 'halfords.be', 'autobanden.be',
  'leonidas.be', 'paul-bakery.com', 'exki.com', 'panos.be', 'class-velo.be',
  'kruidvat.be', 'zeeman.com', 'action.com', 'colruyt.be', 'delhaize.be',
  'carrefour.be', 'aldi.be', 'lidl.be', 'mediamarkt.be', 'coolblue.be',
  'brantano.be', 'torfs.be', 'jbc.be', 'zeb.be', 'casa.com',
  'brico.be', 'gamma.be', 'hubo.be', 'Oh-Green.be', 'aveve.be',
  'basic-fit.com', 'jims.be', 'fitforlife.be',
  'century21.be', 'remax.be', 'era.be', 'immoweb.be',
  'securitas.be', 'g4s.com', 'seris.be',
  'randstad.be', 'adecco.be', 'tempo-team.be', 'manpower.be',
  'loxam.be', 'boels.com', 'hertz.be', 'europcar.be', 'avis.be',
  'tui.be', 'neckermann.be', 'connections.be',
];

// URL pad patronen die franchise/keten indiceren
const CHAIN_URL_PATTERNS = [
  /\/vestigingen\//i, /\/filialen\//i, /\/salons?\//i, /\/locaties?\//i,
  /\/winkels?\//i, /\/stores?\//i, /\/locations?\//i, /\/branches?\//i,
  /\/find-us/i, /\/onze-winkels/i, /\/find-a-store/i,
];

// Franchise naampatronen: "MERK - Stad" of "MERK Stad" (alleen voor steden >50k inwoners)
const FLEMISH_CITIES = [
  'Gent', 'Antwerpen', 'Brugge', 'Leuven', 'Mechelen', 'Aalst', 'Hasselt',
  'Kortrijk', 'Oostende', 'Genk', 'Roeselare', 'Turnhout', 'Sint-Niklaas',
  'Dendermonde', 'Brussel', 'Brussels',
];
const FRANCHISE_NAME_RE = new RegExp(
  `^.+\\s[–\\-]\\s(${FLEMISH_CITIES.join('|')})$|^.+\\s(${FLEMISH_CITIES.join('|')})$`,
  'i',
);

function extractRootDomain(url: string): string {
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    const parts = hostname.replace(/^www\./, '').split('.');
    return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
  } catch {
    return '';
  }
}

function detectChainWarning(lead: { name: string; website: string | null; reviewCount: number | null }): string | null {
  const reasons: string[] = [];

  // Signal 1: Bekend ketendomein
  if (lead.website) {
    const domain = extractRootDomain(lead.website);
    if (CHAIN_DOMAIN_BLOCKLIST.some((d) => domain === d || domain.endsWith('.' + d))) {
      reasons.push('Bekend ketendomein');
    }

    // Signal 2: URL pad patronen
    if (CHAIN_URL_PATTERNS.some((re) => re.test(lead.website!))) {
      reasons.push('Franchise URL structuur');
    }
  }

  // Signal 3: Franchise naampatroon
  if (FRANCHISE_NAME_RE.test(lead.name)) {
    reasons.push('Franchise naampatroon');
  }

  // Signal 4: Heel veel reviews (300+)
  if ((lead.reviewCount ?? 0) >= 300) {
    reasons.push('300+ reviews');
  }

  return reasons.length > 0 ? reasons.join(' · ') : null;
}

// Batch-level detectie: markeer duplicaat namen binnen een batch
export function detectBatchDuplicates(leads: DiscoveredLead[]): void {
  const nameCount = new Map<string, number>();
  for (const lead of leads) {
    const normalized = lead.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    nameCount.set(normalized, (nameCount.get(normalized) ?? 0) + 1);
  }
  for (const lead of leads) {
    const normalized = lead.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if ((nameCount.get(normalized) ?? 0) >= 2 && !lead.chainWarning) {
      lead.chainWarning = 'Meerdere locaties in batch';
    }
  }
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
    chainWarning: null,
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
    chainWarning: null,
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
    chainWarning: null,
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
    chainWarning: null,
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
    chainWarning: null,
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
  const subsectors = SECTOR_CATEGORIES[sector];
  const term = subsectors?.[0] ?? sector;
  return `${term} in ${city}`;
}

// Genereer meerdere queries voor bredere dekking (1 per subsector)
export function buildSearchQueries(sector: string, city: string, count: number): string[] {
  const subsectors = SECTOR_CATEGORIES[sector] ?? [sector];
  const queries = subsectors
    .slice(0, count)
    .map((term) => `${term} in ${city}`);
  return queries.length > 0 ? queries : [`${sector} in ${city}`];
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
  city?: string,
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
  if (globalCallCount >= maxCalls) {
    console.error(`[Places Discovery] Budget limit reached (${maxCalls} calls). Set PLACES_API_MAX_CALLS to increase.`);
    return { leads: [], fromMock: false };
  }

  // LocationBias opbouwen als we coördinaten hebben
  const geo = city ? CITY_COORDINATES[city] : undefined;
  const locationBias = geo
    ? { circle: { center: { latitude: geo.lat, longitude: geo.lng }, radius: geo.radius } }
    : undefined;

  const allPlaces: PlacesApiPlace[] = [];
  let pageToken: string | undefined;
  const maxPages = Math.ceil(maxResults / 20); // max pagina's nodig om target te halen

  try {
    for (let page = 0; page < maxPages; page++) {
      if (globalCallCount >= maxCalls) {
        console.warn(`[Places Discovery] Budget limit reached mid-pagination`);
        break;
      }
      globalCallCount++;

      console.log(`[Places Discovery] Searching: "${query}" page ${page + 1} (call #${globalCallCount})`);

      const requestBody: Record<string, unknown> = {
        textQuery: query,
        maxResultCount: 20,
      };
      if (locationBias) requestBody.locationBias = locationBias;
      if (pageToken) requestBody.pageToken = pageToken;

      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Places Discovery] API error ${response.status}:`, errorText);
        break;
      }

      const data: PlacesApiResponse = await response.json();

      if (data.places) {
        allPlaces.push(...data.places);
      }

      // Stop als er geen volgende pagina is of we genoeg hebben
      if (!data.nextPageToken || allPlaces.length >= maxResults) break;
      pageToken = data.nextPageToken;
    }

    if (allPlaces.length === 0) {
      console.log('[Places Discovery] No results found');
      return { leads: [], fromMock: false };
    }

    const leads: DiscoveredLead[] = allPlaces
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
        chainWarning: detectChainWarning({
          name: place.displayName?.text ?? '',
          website: place.websiteUri ?? null,
          reviewCount: place.userRatingCount ?? null,
        }),
      }))
      // Sorteer op kwaliteitsscore (hoogste eerst)
      .sort((a, b) => b.qualityScore - a.qualityScore);

    console.log(`[Places Discovery] Found ${leads.length} qualified leads from ${allPlaces.length} results`);
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
