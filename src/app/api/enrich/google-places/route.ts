import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { lookupGooglePlaces } from '@/lib/google-places';

export async function POST(request: NextRequest) {
  try {
    const { businessId } = await request.json();

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 });
    }

    const business = await db.query.businesses.findFirst({
      where: eq(schema.businesses.id, businessId),
    });

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const result = await lookupGooglePlaces(business.name, {
      street: business.street ?? undefined,
      city: business.city ?? undefined,
      postalCode: business.postalCode ?? undefined,
      country: business.country,
    });

    await db
      .update(schema.businesses)
      .set({
        googlePlaceId: result.placeId,
        googleRating: result.rating,
        googleReviewCount: result.reviewCount,
        googleBusinessStatus: result.businessStatus,
        googlePhotosCount: result.photosCount,
        hasGoogleBusinessProfile: result.hasGBP,
        googlePlacesEnrichedAt: new Date(),
        // Update website/phone from Google if we don't have them
        ...(result.websiteUri && !business.website ? { website: result.websiteUri } : {}),
        ...(result.phoneNumber && !business.phone ? { phone: result.phoneNumber } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.businesses.id, businessId));

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Google Places enrichment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
