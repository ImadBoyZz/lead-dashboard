// KBO backfill: loop over bestaande BE-leads zonder KBO-match en probeer te enrichen.
// Plan: ik-heb-eigenlijk-een-merry-oasis.md §Chunk 3.
//
// Rescored leads krijgen ook hun lead_scores bijgewerkt zodat de UI de nieuwe
// maturity cluster + IT-disqualifier direct reflecteert.
//
// Gebruik:
//   npx tsx scripts/kbo-backfill.ts                (alle BE leads zonder kboMatchedAt)
//   npx tsx scripts/kbo-backfill.ts --limit 100    (eerste 100, sanity check)
//   npx tsx scripts/kbo-backfill.ts --force        (re-match ook leads met kboMatchedAt)

import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { and, eq, isNull } from 'drizzle-orm';

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const FORCE = args.includes('--force');

async function main() {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { matchKboEnterprise } = await import('../src/lib/kbo/matcher');
  const { extractPostcodeFromAddress } = await import('../src/lib/kbo/normalize');
  const { computeScore } = await import('../src/lib/scoring');

  console.log(`\n=== KBO Backfill — BE leads ${FORCE ? '(force re-match)' : 'zonder kboMatchedAt'} ===\n`);

  const whereClause = FORCE
    ? eq(schema.businesses.country, 'BE')
    : and(eq(schema.businesses.country, 'BE'), isNull(schema.businesses.kboMatchedAt))!;

  const leadsQuery = db
    .select({
      id: schema.businesses.id,
      name: schema.businesses.name,
      postalCode: schema.businesses.postalCode,
      street: schema.businesses.street,
      city: schema.businesses.city,
      website: schema.businesses.website,
      phone: schema.businesses.phone,
      email: schema.businesses.email,
      foundedDate: schema.businesses.foundedDate,
      naceCode: schema.businesses.naceCode,
      legalForm: schema.businesses.legalForm,
      googleRating: schema.businesses.googleRating,
      googleReviewCount: schema.businesses.googleReviewCount,
      googleBusinessStatus: schema.businesses.googleBusinessStatus,
      googlePhotosCount: schema.businesses.googlePhotosCount,
      hasGoogleBusinessProfile: schema.businesses.hasGoogleBusinessProfile,
      googlePlacesEnrichedAt: schema.businesses.googlePlacesEnrichedAt,
      recentReviewCount: schema.businesses.recentReviewCount,
      reviewVelocity: schema.businesses.reviewVelocity,
      googlePhotosCountPrev: schema.businesses.googlePhotosCountPrev,
      googleBusinessUpdatedAt: schema.businesses.googleBusinessUpdatedAt,
      hasGoogleAds: schema.businesses.hasGoogleAds,
      hasSocialMediaLinks: schema.businesses.hasSocialMediaLinks,
      chainClassification: schema.businesses.chainClassification,
      chainConfidence: schema.businesses.chainConfidence,
      optOut: schema.businesses.optOut,
    })
    .from(schema.businesses)
    .where(whereClause);

  const allLeads = LIMIT < Infinity ? await leadsQuery.limit(LIMIT) : await leadsQuery;

  console.log(`Te verwerken: ${allLeads.length} leads\n`);

  let matched = 0;
  let rescored = 0;
  let disqualifiedNew = 0;
  const now = new Date();

  for (const [i, lead] of allLeads.entries()) {
    // Gebruik bestaande postcode of extract uit adres (street is soms full address)
    const postcode = lead.postalCode ?? extractPostcodeFromAddress(lead.street);
    const match = await matchKboEnterprise({ name: lead.name, postalCode: postcode });

    if (match) {
      matched++;
      const nextFounded = lead.foundedDate ?? match.foundedDate ?? null;
      const nextNace = lead.naceCode ?? match.naceCode ?? null;
      const nextLegal = lead.legalForm ?? match.legalForm ?? null;

      await db
        .update(schema.businesses)
        .set({
          kboEnterpriseNumber: match.enterpriseNumber,
          kboMatchConfidence: match.confidence,
          kboMatchedAt: now,
          foundedDate: nextFounded,
          naceCode: nextNace,
          legalForm: nextLegal,
          postalCode: lead.postalCode ?? postcode ?? undefined,
          updatedAt: now,
        })
        .where(eq(schema.businesses.id, lead.id));

      // Re-score met nieuwe velden
      const scoreResult = computeScore({
        business: {
          website: lead.website,
          foundedDate: nextFounded,
          naceCode: nextNace,
          legalForm: nextLegal,
          email: lead.email,
          phone: lead.phone,
          googleRating: lead.googleRating,
          googleReviewCount: lead.googleReviewCount,
          googleBusinessStatus: lead.googleBusinessStatus,
          googlePhotosCount: lead.googlePhotosCount,
          hasGoogleBusinessProfile: lead.hasGoogleBusinessProfile,
          googlePlacesEnrichedAt: lead.googlePlacesEnrichedAt,
          recentReviewCount: lead.recentReviewCount,
          reviewVelocity: lead.reviewVelocity,
          googlePhotosCountPrev: lead.googlePhotosCountPrev,
          googleBusinessUpdatedAt: lead.googleBusinessUpdatedAt,
          hasGoogleAds: lead.hasGoogleAds,
          hasSocialMediaLinks: lead.hasSocialMediaLinks,
          chainClassification: lead.chainClassification,
          chainConfidence: lead.chainConfidence,
          optOut: lead.optOut,
        },
        audit: null,
      });

      // Upsert lead_scores (unique op businessId)
      await db
        .insert(schema.leadScores)
        .values({
          businessId: lead.id,
          totalScore: scoreResult.totalScore,
          scoreBreakdown: scoreResult.breakdown as Record<string, unknown>,
          maturityCluster: scoreResult.maturityCluster,
          disqualified: scoreResult.disqualified,
          disqualifyReason: scoreResult.disqualifyReason,
          scoredAt: now,
        })
        .onConflictDoUpdate({
          target: schema.leadScores.businessId,
          set: {
            totalScore: scoreResult.totalScore,
            scoreBreakdown: scoreResult.breakdown as Record<string, unknown>,
            maturityCluster: scoreResult.maturityCluster,
            disqualified: scoreResult.disqualified,
            disqualifyReason: scoreResult.disqualifyReason,
            scoredAt: now,
          },
        });
      rescored++;
      if (scoreResult.disqualified) disqualifiedNew++;
    } else {
      await db
        .update(schema.businesses)
        .set({ kboMatchedAt: now, updatedAt: now, postalCode: lead.postalCode ?? postcode ?? undefined })
        .where(eq(schema.businesses.id, lead.id));
    }

    if ((i + 1) % 25 === 0) {
      console.log(`  ${i + 1}/${allLeads.length} verwerkt — matches: ${matched}, gedisqualificeerd: ${disqualifiedNew}`);
    }
  }

  const pct = (n: number) => ((n / Math.max(1, allLeads.length)) * 100).toFixed(1);

  console.log(`\n─── Resultaten ───`);
  console.log(`  Leads verwerkt:       ${allLeads.length}`);
  console.log(`  KBO matches:          ${matched}  (${pct(matched)}%)`);
  console.log(`  Opnieuw gescoord:     ${rescored}`);
  console.log(`  Nieuw gedisqualificeerd (NACE/status): ${disqualifiedNew}`);
  console.log('');

  process.exit(0);
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
