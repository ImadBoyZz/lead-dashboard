import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { computeScore } from '@/lib/scoring';
import { lookupGooglePlaces } from '@/lib/google-places';
import { rateLimit } from '@/lib/rate-limit';

const enrichSchema = z.object({
  businessId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const { allowed } = rateLimit('enrich', 30, 60 * 1000); // 30 per minuut
  if (!allowed) {
    return NextResponse.json({ error: 'Te veel verzoeken. Probeer over een minuut opnieuw.' }, { status: 429 });
  }

  try {
  const body = await request.json();
  const parsed = enrichSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ongeldig verzoek', details: parsed.error.flatten() }, { status: 400 });
  }
  const { businessId } = parsed.data;

  // 1. Get the business from DB
  const business = await db.query.businesses.findFirst({
    where: eq(schema.businesses.id, businessId),
  });

  if (!business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 400 });
  }

  // 2. Google Places enrichment (run on first enrichment OR re-enrichment after 90 days)
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  const needsEnrichment = !business.googlePlacesEnrichedAt ||
    (Date.now() - new Date(business.googlePlacesEnrichedAt).getTime() > NINETY_DAYS_MS);

  if (needsEnrichment) {
    try {
      const placesResult = await lookupGooglePlaces(business.name, {
        street: business.street ?? undefined,
        city: business.city ?? undefined,
        postalCode: business.postalCode ?? undefined,
        country: business.country,
      });

      // Fase 2: Delta-detectie & review velocity
      const prevReviewCount = business.googleReviewCount ?? 0;
      const newReviewCount = placesResult.reviewCount ?? 0;
      const recentReviewCount = Math.max(0, newReviewCount - prevReviewCount);
      const reviewVelocity = newReviewCount > 0 ? recentReviewCount / newReviewCount : 0;

      // Detect GBP changes (photos delta)
      const prevPhotos = business.googlePhotosCount ?? 0;
      const newPhotos = placesResult.photosCount ?? 0;
      const gbpChanged = newPhotos !== prevPhotos ||
        placesResult.rating !== business.googleRating;

      await db
        .update(schema.businesses)
        .set({
          googlePlaceId: placesResult.placeId,
          googleRating: placesResult.rating,
          googleReviewCount: placesResult.reviewCount,
          googleBusinessStatus: placesResult.businessStatus,
          googlePhotosCount: placesResult.photosCount,
          hasGoogleBusinessProfile: placesResult.hasGBP,
          googlePlacesEnrichedAt: new Date(),
          // Fase 2: velocity & delta velden
          recentReviewCount: business.googlePlacesEnrichedAt ? recentReviewCount : null,
          reviewVelocity: business.googlePlacesEnrichedAt ? reviewVelocity : null,
          googlePhotosCountPrev: prevPhotos,
          ...(gbpChanged ? { googleBusinessUpdatedAt: new Date() } : {}),
          ...(placesResult.websiteUri && !business.website ? { website: placesResult.websiteUri } : {}),
          ...(placesResult.phoneNumber && !business.phone ? { phone: placesResult.phoneNumber } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.businesses.id, businessId));

      // Re-read business with updated data
      Object.assign(business, {
        googlePlaceId: placesResult.placeId,
        googleRating: placesResult.rating,
        googleReviewCount: placesResult.reviewCount,
        googleBusinessStatus: placesResult.businessStatus,
        googlePhotosCount: placesResult.photosCount,
        hasGoogleBusinessProfile: placesResult.hasGBP,
        recentReviewCount: business.googlePlacesEnrichedAt ? recentReviewCount : null,
        reviewVelocity: business.googlePlacesEnrichedAt ? reviewVelocity : null,
        googlePhotosCountPrev: prevPhotos,
        ...(gbpChanged ? { googleBusinessUpdatedAt: new Date() } : {}),
        ...(placesResult.websiteUri && !business.website ? { website: placesResult.websiteUri } : {}),
        ...(placesResult.phoneNumber && !business.phone ? { phone: placesResult.phoneNumber } : {}),
      });
    } catch (e) {
      console.error('Google Places enrichment error:', e);
    }
  }

  // 3. Website audit (only if business has a website)
  let auditData = null;

  if (business.website) {
    // 3a. Call Firecrawl API to scrape the website
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url: business.website,
        formats: ['json'],
        jsonOptions: {
          prompt:
            'Analyze this website and extract: whether it has SSL, if it is mobile responsive, what CMS it uses (WordPress, Wix, Squarespace, Joomla, etc.), what technologies it uses, whether it has Google Analytics (GA4/gtag), Google Tag Manager, Facebook Pixel, Google Ads tags (gtag with AW- conversion ID, or google_ads_conversion), a cookie consent banner, meta description, Open Graph tags, and structured data (JSON-LD). Also check for social media links (Facebook, Instagram, LinkedIn, Twitter/X). Also extract any contact email addresses and phone numbers you find on the page.',
          schema: {
            type: 'object',
            properties: {
              hasSsl: { type: 'boolean' },
              isMobileResponsive: { type: 'boolean' },
              hasViewportMeta: { type: 'boolean' },
              detectedCms: { type: 'string', nullable: true },
              cmsVersion: { type: 'string', nullable: true },
              detectedTechnologies: {
                type: 'array',
                items: { type: 'string' },
              },
              hasGoogleAnalytics: { type: 'boolean' },
              hasGoogleTagManager: { type: 'boolean' },
              hasFacebookPixel: { type: 'boolean' },
              hasGoogleAdsTag: { type: 'boolean' },
              hasSocialMediaLinks: { type: 'boolean' },
              hasCookieBanner: { type: 'boolean' },
              hasMetaDescription: { type: 'boolean' },
              hasOpenGraph: { type: 'boolean' },
              hasStructuredData: { type: 'boolean' },
              serverHeader: { type: 'string', nullable: true },
              poweredBy: { type: 'string', nullable: true },
              contactEmail: { type: 'string', nullable: true },
              contactPhone: { type: 'string', nullable: true },
            },
          },
        },
      }),
    });

    let firecrawlData: Record<string, unknown> | null = null;
    if (firecrawlResponse.ok) {
      firecrawlData = await firecrawlResponse.json();
    } else {
      console.error('Firecrawl API error:', firecrawlResponse.status, await firecrawlResponse.text().catch(() => ''));
    }

    // 3b. Google PageSpeed API
    let pagespeedMobile: number | null = null;
    let pagespeedDesktop: number | null = null;
    let pagespeedFcp: number | null = null;
    let pagespeedLcp: number | null = null;
    let pagespeedCls: number | null = null;

    try {
      const psResponse = await fetch(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(business.website)}&strategy=mobile`,
      );
      const psData = await psResponse.json();
      if (psData.lighthouseResult) {
        pagespeedMobile = Math.round(
          psData.lighthouseResult.categories.performance.score * 100,
        );
        const audits = psData.lighthouseResult.audits;
        const fcpVal = audits['first-contentful-paint']?.numericValue;
        pagespeedFcp = fcpVal != null ? fcpVal / 1000 : null;
        const lcpVal = audits['largest-contentful-paint']?.numericValue;
        pagespeedLcp = lcpVal != null ? lcpVal / 1000 : null;
        pagespeedCls = audits['cumulative-layout-shift']?.numericValue ?? null;
      }

      const psDesktop = await fetch(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(business.website)}&strategy=desktop`,
      );
      const psDesktopData = await psDesktop.json();
      if (psDesktopData.lighthouseResult) {
        pagespeedDesktop = Math.round(
          psDesktopData.lighthouseResult.categories.performance.score * 100,
        );
      }
    } catch (e) {
      console.error('PageSpeed API error:', e);
    }

    // 3c. Extract Firecrawl results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extracted: Record<string, any> = (firecrawlData as any)?.data?.json || {};

    // 3d. Update contact info from website scrape if missing
    if (!business.email && extracted.contactEmail) {
      await db
        .update(schema.businesses)
        .set({ email: extracted.contactEmail, updatedAt: new Date() })
        .where(eq(schema.businesses.id, businessId));
      Object.assign(business, { email: extracted.contactEmail });
    }
    if (!business.phone && extracted.contactPhone) {
      await db
        .update(schema.businesses)
        .set({ phone: extracted.contactPhone, updatedAt: new Date() })
        .where(eq(schema.businesses.id, businessId));
      Object.assign(business, { phone: extracted.contactPhone });
    }

    // 3e. Upsert audit results
    auditData = {
      businessId,
      hasWebsite: true,
      websiteUrl: business.website,
      websiteHttpStatus: 200,
      pagespeedMobileScore: pagespeedMobile,
      pagespeedDesktopScore: pagespeedDesktop,
      pagespeedFcp,
      pagespeedLcp,
      pagespeedCls,
      hasSsl: extracted.hasSsl ?? business.website?.startsWith('https'),
      isMobileResponsive: extracted.isMobileResponsive ?? null,
      hasViewportMeta: extracted.hasViewportMeta ?? null,
      detectedCms: extracted.detectedCms || null,
      cmsVersion: extracted.cmsVersion || null,
      detectedTechnologies: extracted.detectedTechnologies || [],
      serverHeader: extracted.serverHeader || null,
      poweredBy: extracted.poweredBy || null,
      hasGoogleAnalytics: extracted.hasGoogleAnalytics ?? null,
      hasGoogleTagManager: extracted.hasGoogleTagManager ?? null,
      hasFacebookPixel: extracted.hasFacebookPixel ?? null,
      hasCookieBanner: extracted.hasCookieBanner ?? null,
      hasMetaDescription: extracted.hasMetaDescription ?? null,
      hasOpenGraph: extracted.hasOpenGraph ?? null,
      hasStructuredData: extracted.hasStructuredData ?? null,
      hasGoogleAdsTag: extracted.hasGoogleAdsTag ?? null,
      hasSocialMediaLinks: extracted.hasSocialMediaLinks ?? null,
      auditedAt: new Date(),
    };

    const existing = await db.query.auditResults.findFirst({
      where: eq(schema.auditResults.businessId, businessId),
    });

    if (existing) {
      await db
        .update(schema.auditResults)
        .set({ ...auditData, auditVersion: (existing.auditVersion || 0) + 1 })
        .where(eq(schema.auditResults.businessId, businessId));
    } else {
      await db.insert(schema.auditResults).values(auditData);
    }

    // Fase 2: Sync "bewust digitaal" signalen naar business voor scoring
    const hasAdsTag = extracted.hasGoogleAdsTag === true;
    const hasSocial = extracted.hasSocialMediaLinks === true;
    if (hasAdsTag || hasSocial) {
      await db
        .update(schema.businesses)
        .set({
          ...(hasAdsTag ? { hasGoogleAds: true } : {}),
          ...(hasSocial ? { hasSocialMediaLinks: true } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.businesses.id, businessId));
      Object.assign(business, {
        ...(hasAdsTag ? { hasGoogleAds: true } : {}),
        ...(hasSocial ? { hasSocialMediaLinks: true } : {}),
      });
    }
  }

  // 4. Compute and upsert score
  const scoreResult = computeScore({
    business: {
      website: business.website,
      foundedDate: business.foundedDate,
      naceCode: business.naceCode,
      legalForm: business.legalForm,
      email: business.email,
      phone: business.phone,
      googleRating: business.googleRating,
      googleReviewCount: business.googleReviewCount,
      googleBusinessStatus: business.googleBusinessStatus,
      googlePhotosCount: business.googlePhotosCount,
      hasGoogleBusinessProfile: business.hasGoogleBusinessProfile,
      googlePlacesEnrichedAt: business.googlePlacesEnrichedAt,
      recentReviewCount: business.recentReviewCount,
      reviewVelocity: business.reviewVelocity,
      googlePhotosCountPrev: business.googlePhotosCountPrev,
      googleBusinessUpdatedAt: business.googleBusinessUpdatedAt,
      hasGoogleAds: business.hasGoogleAds,
      hasSocialMediaLinks: business.hasSocialMediaLinks,
      optOut: business.optOut,
    },
    audit: auditData
      ? {
          websiteHttpStatus: auditData.websiteHttpStatus ?? null,
          pagespeedMobileScore: auditData.pagespeedMobileScore,
          pagespeedDesktopScore: auditData.pagespeedDesktopScore,
          hasSsl: auditData.hasSsl,
          isMobileResponsive: auditData.isMobileResponsive,
          hasViewportMeta: auditData.hasViewportMeta,
          detectedCms: auditData.detectedCms,
          detectedTechnologies: auditData.detectedTechnologies as string[],
          hasGoogleAnalytics: auditData.hasGoogleAnalytics,
          hasGoogleTagManager: auditData.hasGoogleTagManager,
          hasFacebookPixel: auditData.hasFacebookPixel,
          hasCookieBanner: auditData.hasCookieBanner,
          hasMetaDescription: auditData.hasMetaDescription,
          hasOpenGraph: auditData.hasOpenGraph,
          hasStructuredData: auditData.hasStructuredData,
          auditedAt: auditData.auditedAt ?? null,
          hasGoogleAdsTag: auditData.hasGoogleAdsTag ?? null,
          hasSocialMediaLinks: auditData.hasSocialMediaLinks ?? null,
        }
      : null,
  });

  const existingScore = await db.query.leadScores.findFirst({
    where: eq(schema.leadScores.businessId, businessId),
  });

  if (existingScore) {
    await db
      .update(schema.leadScores)
      .set({
        totalScore: scoreResult.totalScore,
        scoreBreakdown: scoreResult.breakdown,
        maturityCluster: scoreResult.maturityCluster,
        disqualified: scoreResult.disqualified,
        disqualifyReason: scoreResult.disqualifyReason,
        scoredAt: new Date(),
      })
      .where(eq(schema.leadScores.businessId, businessId));
  } else {
    await db.insert(schema.leadScores).values({
      businessId,
      totalScore: scoreResult.totalScore,
      scoreBreakdown: scoreResult.breakdown,
      maturityCluster: scoreResult.maturityCluster,
      disqualified: scoreResult.disqualified,
      disqualifyReason: scoreResult.disqualifyReason,
    });
  }

  return NextResponse.json({
    success: true,
    score: scoreResult.totalScore,
    disqualified: scoreResult.disqualified,
    disqualifyReason: scoreResult.disqualifyReason,
    breakdown: scoreResult.breakdown,
    audit: auditData,
  });
  } catch (error) {
    console.error('Enrich error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
