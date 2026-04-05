import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';
import { computeScore } from '../src/lib/scoring';

const sqlClient = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlClient, { schema });

async function main() {
  // ── Step 1-2: Rescore businesses ─────────────────────
  console.log('Fetching all businesses with their scores and audit data...');

  const rows = await db
    .select({
      business: schema.businesses,
      score: schema.leadScores,
      audit: schema.auditResults,
    })
    .from(schema.businesses)
    .leftJoin(schema.leadScores, eq(schema.businesses.id, schema.leadScores.businessId))
    .leftJoin(schema.auditResults, eq(schema.businesses.id, schema.auditResults.businessId));

  console.log(`Found ${rows.length} businesses to rescore.`);

  let updated = 0;
  let errors = 0;

  for (const row of rows) {
    if (!row.score) continue;

    const auditData = row.audit
      ? {
          websiteHttpStatus: row.audit.websiteHttpStatus ?? null,
          pagespeedMobileScore: row.audit.pagespeedMobileScore,
          pagespeedDesktopScore: row.audit.pagespeedDesktopScore,
          hasSsl: row.audit.hasSsl,
          isMobileResponsive: row.audit.isMobileResponsive,
          hasViewportMeta: row.audit.hasViewportMeta,
          detectedCms: row.audit.detectedCms,
          detectedTechnologies: (row.audit.detectedTechnologies as string[]) ?? [],
          hasGoogleAnalytics: row.audit.hasGoogleAnalytics,
          hasGoogleTagManager: row.audit.hasGoogleTagManager,
          hasFacebookPixel: row.audit.hasFacebookPixel,
          hasCookieBanner: row.audit.hasCookieBanner,
          hasMetaDescription: row.audit.hasMetaDescription,
          hasOpenGraph: row.audit.hasOpenGraph,
          hasStructuredData: row.audit.hasStructuredData,
          auditedAt: row.audit.auditedAt,
          hasGoogleAdsTag: row.audit.hasGoogleAdsTag ?? null,
          hasSocialMediaLinks: row.audit.hasSocialMediaLinks ?? null,
        }
      : null;

    const result = computeScore({
      business: {
        website: row.business.website,
        foundedDate: row.business.foundedDate,
        naceCode: row.business.naceCode,
        legalForm: row.business.legalForm,
        email: row.business.email,
        phone: row.business.phone,
        googleRating: row.business.googleRating,
        googleReviewCount: row.business.googleReviewCount,
        googleBusinessStatus: row.business.googleBusinessStatus,
        googlePhotosCount: row.business.googlePhotosCount,
        hasGoogleBusinessProfile: row.business.hasGoogleBusinessProfile,
        googlePlacesEnrichedAt: row.business.googlePlacesEnrichedAt,
        recentReviewCount: row.business.recentReviewCount,
        reviewVelocity: row.business.reviewVelocity,
        googlePhotosCountPrev: row.business.googlePhotosCountPrev,
        googleBusinessUpdatedAt: row.business.googleBusinessUpdatedAt,
        hasGoogleAds: row.business.hasGoogleAds,
        hasSocialMediaLinks: row.business.hasSocialMediaLinks,
        optOut: row.business.optOut,
      },
      audit: auditData,
    });

    try {
      await db
        .update(schema.leadScores)
        .set({
          totalScore: result.totalScore,
          scoreBreakdown: result.breakdown,
          maturityCluster: result.maturityCluster,
          disqualified: result.disqualified,
          disqualifyReason: result.disqualifyReason,
          scoredAt: new Date(),
        })
        .where(eq(schema.leadScores.businessId, row.business.id));

      updated++;
      process.stdout.write(`\rRescored businesses: ${updated}/${rows.length}`);
    } catch (err) {
      errors++;
      console.error(`\nError rescoring ${row.business.name}:`, err);
    }
  }

  console.log(`\nBusinesses done! Rescored: ${updated}, Errors: ${errors}`);
}

main().catch(console.error);
