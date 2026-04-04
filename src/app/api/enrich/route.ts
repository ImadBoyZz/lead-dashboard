import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { computeScore } from '@/lib/scoring';

export async function POST(request: NextRequest) {
  const { businessId } = await request.json();

  // 1. Get the business from DB
  const business = await db.query.businesses.findFirst({
    where: eq(schema.businesses.id, businessId),
  });

  if (!business || !business.website) {
    return NextResponse.json(
      { error: 'Business not found or has no website' },
      { status: 400 },
    );
  }

  // 2. Call Firecrawl API to scrape the website
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
          'Analyze this website and extract: whether it has SSL, if it is mobile responsive, what CMS it uses (WordPress, Wix, Squarespace, Joomla, etc.), what technologies it uses, whether it has Google Analytics, Google Tag Manager, Facebook Pixel, a cookie consent banner, meta description, Open Graph tags, and structured data (JSON-LD).',
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
            hasCookieBanner: { type: 'boolean' },
            hasMetaDescription: { type: 'boolean' },
            hasOpenGraph: { type: 'boolean' },
            hasStructuredData: { type: 'boolean' },
            serverHeader: { type: 'string', nullable: true },
            poweredBy: { type: 'string', nullable: true },
          },
        },
      },
    }),
  });

  const firecrawlData = await firecrawlResponse.json();

  // 3. Also call Google PageSpeed API (free)
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
      pagespeedFcp =
        audits['first-contentful-paint']?.numericValue / 1000 || null;
      pagespeedLcp =
        audits['largest-contentful-paint']?.numericValue / 1000 || null;
      pagespeedCls =
        audits['cumulative-layout-shift']?.numericValue || null;
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

  // 4. Extract Firecrawl results
  const extracted = firecrawlData?.data?.json || {};

  // 5. Upsert audit results
  const auditData = {
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
    auditedAt: new Date(),
  };

  // Check if audit already exists
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

  // 6. Compute and upsert score
  const scoreResult = computeScore({
    business: {
      website: business.website,
      foundedDate: business.foundedDate,
      naceCode: business.naceCode,
      googleRating: business.googleRating,
      googleReviewCount: business.googleReviewCount,
      optOut: business.optOut,
    },
    audit: auditData,
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
        scoredAt: new Date(),
      })
      .where(eq(schema.leadScores.businessId, businessId));
  } else {
    await db.insert(schema.leadScores).values({
      businessId,
      totalScore: scoreResult.totalScore,
      scoreBreakdown: scoreResult.breakdown,
    });
  }

  return NextResponse.json({
    success: true,
    score: scoreResult.totalScore,
    breakdown: scoreResult.breakdown,
    audit: auditData,
  });
}
