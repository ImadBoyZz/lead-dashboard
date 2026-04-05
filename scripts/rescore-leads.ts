import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, sql, gt } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';
import { computeScore } from '../src/lib/scoring';
import { computePreScore } from '../src/lib/pre-scoring';

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

  // ── Step 3-4: Rescore kboCandidates pre-scores (bulk SQL) ───────
  console.log('\nRescoring kboCandidates in batches (bulk update)...');

  const [{ count: totalCandidates }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.kboCandidates);

  console.log(`Found ${totalCandidates} candidates to rescore.`);

  let candidateUpdated = 0;
  let candidateErrors = 0;
  const FETCH_SIZE = 2000;
  const UPDATE_BATCH = 50;  // concurrent updates per batch
  let lastId = '00000000-0000-0000-0000-000000000000';

  while (true) {
    const batch = await db
      .select({
        id: schema.kboCandidates.id,
        naceCode: schema.kboCandidates.naceCode,
        legalForm: schema.kboCandidates.legalForm,
        website: schema.kboCandidates.website,
        email: schema.kboCandidates.email,
        phone: schema.kboCandidates.phone,
        foundedDate: schema.kboCandidates.foundedDate,
        googleReviewCount: schema.kboCandidates.googleReviewCount,
        googleRating: schema.kboCandidates.googleRating,
        hasGoogleBusinessProfile: schema.kboCandidates.hasGoogleBusinessProfile,
        googleBusinessStatus: schema.kboCandidates.googleBusinessStatus,
        name: schema.kboCandidates.name,
      })
      .from(schema.kboCandidates)
      .where(gt(schema.kboCandidates.id, lastId))
      .orderBy(schema.kboCandidates.id)
      .limit(FETCH_SIZE);

    if (batch.length === 0) break;

    // Process in concurrent sub-batches
    for (let i = 0; i < batch.length; i += UPDATE_BATCH) {
      const subBatch = batch.slice(i, i + UPDATE_BATCH);
      const promises = subBatch.map(candidate => {
        const preScoreResult = computePreScore({
          naceCode: candidate.naceCode,
          legalForm: candidate.legalForm,
          website: candidate.website,
          email: candidate.email,
          phone: candidate.phone,
          foundedDate: candidate.foundedDate,
          googleReviewCount: candidate.googleReviewCount,
          googleRating: candidate.googleRating,
          hasGoogleBusinessProfile: candidate.hasGoogleBusinessProfile,
          googleBusinessStatus: candidate.googleBusinessStatus,
        });

        return db
          .update(schema.kboCandidates)
          .set({
            preScore: preScoreResult.totalScore,
            scoreBreakdown: preScoreResult.breakdown,
            updatedAt: new Date(),
          })
          .where(eq(schema.kboCandidates.id, candidate.id))
          .then(() => { candidateUpdated++; })
          .catch(err => {
            candidateErrors++;
            console.error(`\nError rescoring ${candidate.name}:`, err);
          });
      });

      await Promise.all(promises);
      process.stdout.write(`\rRescored candidates: ${candidateUpdated}/${totalCandidates}`);
    }

    lastId = batch[batch.length - 1].id;
  }

  console.log(`\nCandidates done! Rescored: ${candidateUpdated}, Errors: ${candidateErrors}`);
}

main().catch(console.error);
