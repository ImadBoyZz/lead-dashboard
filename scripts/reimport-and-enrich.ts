import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, desc, sql, and, isNotNull } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';
import { computeScore } from '../src/lib/scoring';
import { lookupGooglePlaces } from '../src/lib/google-places';

const sqlClient = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlClient, { schema });

const IMPORT_COUNT = 50;
const DELAY_MS = 400;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // ── STAP 1: Verwijder oude leads ──
  console.log('\n=== STAP 1: Oude leads verwijderen ===');
  await db.execute(sql`DELETE FROM businesses`);
  console.log('  Verwijderd (cascade)');

  // Reset imported candidates
  await db.execute(sql`
    UPDATE kbo_candidates SET status = 'pending', imported_at = NULL
    WHERE status = 'imported'
  `);
  console.log('  Imported candidates gereset');

  // ── STAP 2: Importeer top 50 candidates MET website ──
  console.log('\n=== STAP 2: Top 50 candidates MET website importeren ===');

  // Direct query: pending candidates WITH website, sorted by pre_score
  const newCandidates = await db
    .select()
    .from(schema.kboCandidates)
    .where(and(
      eq(schema.kboCandidates.status, 'pending'),
      eq(schema.kboCandidates.enterpriseStatus, 'AC'),
      isNotNull(schema.kboCandidates.website),
    ))
    .orderBy(desc(schema.kboCandidates.preScore))
    .limit(IMPORT_COUNT);

  console.log(`  ${newCandidates.length} candidates met website gevonden`);

  const importedIds: string[] = [];

  for (const candidate of newCandidates) {
    const [biz] = await db
      .insert(schema.businesses)
      .values({
        registryId: candidate.registryId,
        country: 'BE',
        name: candidate.name,
        legalForm: candidate.legalForm,
        naceCode: candidate.naceCode,
        foundedDate: candidate.foundedDate,
        street: candidate.street,
        houseNumber: candidate.houseNumber,
        postalCode: candidate.postalCode,
        city: candidate.city,
        province: candidate.province,
        website: candidate.website,
        email: candidate.email,
        phone: candidate.phone,
        dataSource: 'kbo_bulk',
      })
      .returning({ id: schema.businesses.id });

    await db.insert(schema.leadStatuses).values({ businessId: biz.id, status: 'new' });
    await db.insert(schema.leadScores).values({ businessId: biz.id, totalScore: 0 });
    await db.insert(schema.leadPipeline).values({ businessId: biz.id, stage: 'new' });

    await db
      .update(schema.kboCandidates)
      .set({ status: 'imported', importedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.kboCandidates.id, candidate.id));

    importedIds.push(biz.id);
    process.stdout.write(`\r  Geïmporteerd: ${importedIds.length}/${newCandidates.length}`);
  }
  console.log(`\n  ${importedIds.length} leads geïmporteerd`);

  // ── STAP 3: Google Places enrichment ──
  console.log('\n=== STAP 3: Google Places enrichment ===');

  let gpSuccess = 0;
  let gpNotFound = 0;

  for (let i = 0; i < importedIds.length; i++) {
    const biz = await db.query.businesses.findFirst({
      where: eq(schema.businesses.id, importedIds[i]),
    });
    if (!biz) continue;

    const shortName = biz.name.length > 35 ? biz.name.substring(0, 35) + '...' : biz.name;
    process.stdout.write(`\r  [${i + 1}/${importedIds.length}] ${shortName.padEnd(40)}`);

    try {
      const result = await lookupGooglePlaces(biz.name, {
        street: biz.street ?? undefined,
        city: biz.city ?? undefined,
        postalCode: biz.postalCode ?? undefined,
        country: biz.country,
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
          ...(result.phoneNumber && !biz.phone ? { phone: result.phoneNumber } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.businesses.id, biz.id));

      if (result.hasGBP) gpSuccess++;
      else gpNotFound++;
    } catch (e) {
      console.error(`\n  Error: ${biz.name}:`, e);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n  Google Places: ${gpSuccess} gevonden, ${gpNotFound} niet gevonden`);

  // ── STAP 4: Website audits via /api/enrich ──
  console.log('\n=== STAP 4: Website audits (PageSpeed + Firecrawl) ===');

  const allBiz = await db.select().from(schema.businesses);
  const withWebsite = allBiz.filter((b) => b.website);
  console.log(`  ${withWebsite.length} leads hebben een website — audits starten...`);
  console.log(`  (30-60 sec per lead, totaal ~${Math.round(withWebsite.length * 0.75)} min)`);

  let audited = 0;
  let auditErrors = 0;

  for (const biz of withWebsite) {
    const shortName = biz.name.length > 35 ? biz.name.substring(0, 35) + '...' : biz.name;
    process.stdout.write(`\r  [${audited + auditErrors + 1}/${withWebsite.length}] ${shortName.padEnd(40)}`);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: biz.id }),
      });

      if (response.ok) {
        audited++;
      } else {
        auditErrors++;
      }
    } catch (e) {
      auditErrors++;
    }
  }

  console.log(`\n  Audits: ${audited} geslaagd, ${auditErrors} mislukt`);

  // ── STAP 5: Finale scoring ──
  console.log('\n=== STAP 5: Finale scoring ===');

  const rows = await db
    .select({
      business: schema.businesses,
      score: schema.leadScores,
      audit: schema.auditResults,
    })
    .from(schema.businesses)
    .leftJoin(schema.leadScores, eq(schema.businesses.id, schema.leadScores.businessId))
    .leftJoin(schema.auditResults, eq(schema.businesses.id, schema.auditResults.businessId));

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
        recentReviewCount: row.business.recentReviewCount ?? null,
        reviewVelocity: row.business.reviewVelocity ?? null,
        googlePhotosCountPrev: row.business.googlePhotosCountPrev ?? null,
        googleBusinessUpdatedAt: row.business.googleBusinessUpdatedAt ?? null,
        hasGoogleAds: row.business.hasGoogleAds ?? null,
        hasSocialMediaLinks: row.business.hasSocialMediaLinks ?? null,
        optOut: row.business.optOut,
      },
      audit: auditData ? {
        ...auditData,
        auditedAt: row.audit?.auditedAt ?? null,
        hasGoogleAdsTag: row.audit?.hasGoogleAdsTag ?? null,
        hasSocialMediaLinks: row.audit?.hasSocialMediaLinks ?? null,
      } : null,
    });

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
  }
  console.log(`  ${rows.length} leads gescoord`);

  // ── RESULTATEN ──
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║          RESULTATEN                  ║');
  console.log('╚══════════════════════════════════════╝');

  const distribution = await db.execute(
    sql`SELECT total_score, count(*)::int as cnt FROM lead_scores GROUP BY total_score ORDER BY total_score DESC`
  );

  let hotCount = 0, warmCount = 0, coldCount = 0, disqCount = 0;
  console.log('\nScore Distributie:');
  for (const r of distribution.rows) {
    const score = r.total_score as number;
    const cnt = r.cnt as number;
    const label = score >= 70 ? '🔥 HOT ' : score >= 40 ? '🟡 WARM' : score > 0 ? '🔵 KOUD' : '⛔ DISQ';
    if (score >= 70) hotCount += cnt;
    else if (score >= 40) warmCount += cnt;
    else if (score > 0) coldCount += cnt;
    else disqCount += cnt;
    console.log(`  Score ${String(score).padStart(3)}: ${String(cnt).padStart(3)} leads [${label}]`);
  }

  console.log(`\nTotaal: ${hotCount} hot, ${warmCount} warm, ${coldCount} koud, ${disqCount} gedisqualificeerd`);

  const samples = await db.execute(
    sql`SELECT b.name, b.website, b.city, b.email, b.phone,
               b.google_rating, b.google_review_count,
               b.has_google_business_profile, b.google_business_status,
               ls.total_score
        FROM lead_scores ls
        JOIN businesses b ON b.id = ls.business_id
        ORDER BY ls.total_score DESC
        LIMIT 15`
  );

  console.log('\nTop 15 Leads:');
  for (const r of samples.rows) {
    const score = r.total_score as number;
    const label = score >= 70 ? 'HOT ' : score >= 40 ? 'WARM' : score > 0 ? 'KOUD' : 'DISQ';
    const gbp = r.has_google_business_profile ? 'GBP' : '---';
    const rating = r.google_rating ? `${r.google_rating}★(${r.google_review_count})` : 'no reviews';
    const web = r.website ? '✓ web' : '✗ web';
    const email = r.email ? '✓ email' : '✗ email';
    console.log(`  ${String(score).padStart(3)} [${label}] ${r.name}`);
    console.log(`           ${r.city} | ${gbp} ${rating} | ${web} | ${email}`);
  }

  console.log('\nKlaar!');
}

main().catch(console.error);
