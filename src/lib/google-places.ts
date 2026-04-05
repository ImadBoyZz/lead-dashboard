export interface GooglePlacesResult {
  placeId: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  photosCount: number | null;
  websiteUri: string | null;
  phoneNumber: string | null;
  formattedAddress: string | null;
  hasGBP: boolean;
}

interface PlacesApiPlace {
  id: string;
  displayName?: { text: string };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  photos?: unknown[];
  websiteUri?: string;
  formattedAddress?: string;
  nationalPhoneNumber?: string;
}

interface PlacesApiResponse {
  places?: PlacesApiPlace[];
}

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.photos',
  'places.websiteUri',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
].join(',');

export async function lookupGooglePlaces(
  businessName: string,
  address: { street?: string; city?: string; postalCode?: string; country?: string },
): Promise<GooglePlacesResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn('GOOGLE_PLACES_API_KEY not set, skipping Google Places lookup');
    return emptyResult();
  }

  const queryParts = [businessName];
  if (address.city) queryParts.push(address.city);
  if (address.country === 'BE') queryParts.push('Belgium');
  else if (address.country === 'NL') queryParts.push('Netherlands');

  const textQuery = queryParts.join(' ');

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({ textQuery }),
    });

    if (!response.ok) {
      console.error('Google Places API error:', response.status, await response.text());
      return emptyResult();
    }

    const data: PlacesApiResponse = await response.json();

    if (!data.places || data.places.length === 0) {
      return emptyResult();
    }

    const place = data.places[0];

    return {
      placeId: place.id ?? null,
      rating: place.rating ?? null,
      reviewCount: place.userRatingCount ?? null,
      businessStatus: place.businessStatus ?? null,
      photosCount: place.photos?.length ?? null,
      websiteUri: place.websiteUri ?? null,
      phoneNumber: place.nationalPhoneNumber ?? null,
      formattedAddress: place.formattedAddress ?? null,
      hasGBP: true,
    };
  } catch (error) {
    console.error('Google Places lookup failed:', error);
    return emptyResult();
  }
}

function emptyResult(): GooglePlacesResult {
  return {
    placeId: null,
    rating: null,
    reviewCount: null,
    businessStatus: null,
    photosCount: null,
    websiteUri: null,
    phoneNumber: null,
    formattedAddress: null,
    hasGBP: false,
  };
}
