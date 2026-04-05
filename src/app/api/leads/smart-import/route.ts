import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { buildCandidateFilters } from '@/lib/candidate-filters';
import { computeScore } from '@/lib/scoring';
import { NACE_BLACKLIST_PREFIXES, LEGAL_FORM_EXCLUDE, SECTOR_TIERS } from '@/lib/nace-config';

// Alle NACE prefixes uit tier A + B + C (zichtbaarheid + lokaal + professioneel)
const SECTOR_WHITELIST = [
  ...SECTOR_TIERS.A.prefixes,
  ...SECTOR_TIERS.B.prefixes,
  ...SECTOR_TIERS.C.prefixes,
];

const DEFAULT_FILTERS = {
  naceWhitelist: [...SECTOR_WHITELIST],
  naceBlacklist: [...NACE_BLACKLIST_PREFIXES],
  legalFormExclude: [...LEGAL_FORM_EXCLUDE],
  excludeBlacklisted: true,
  excludeUnreachable: true,
};

// GET — Preview: count van beschikbare candidates
export async function GET() {
  try {
    const filters = buildCandidateFilters({ ...DEFAULT_FILTERS });
    const [result] = await db
      .select({ count: count() })
      .from(schema.kboCandidates)
      .where(filters);

    // Breakdown per province
    const byProvince = await db
      .select({
        province: schema.kboCandidates.province,
        count: count(),
      })
      .from(schema.kboCandidates)
      .where(filters)
      .groupBy(schema.kboCandidates.province);

    return NextResponse.json({
      available: result.count,
      byProvince,
    });
  } catch (error) {
    console.error('Smart import preview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Import N candidates naar businesses tabel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const importCount = body.count ?? 20;
    const profileId = body.profileId as string | undefined;

    // Load profile filters if specified
    let profileFilters = {};
    if (profileId) {
      const [profile] = await db
        .select()
        .from(schema.importProfiles)
        .where(eq(schema.importProfiles.id, profileId))
        .limit(1);
      if (profile) {
        profileFilters = (profile.filters as Record<string, unknown>) ?? {};
      }
    }

    const baseFilters = { ...DEFAULT_FILTERS, ...profileFilters };

    // Tier-based quota: importeer eerst Tier A, dan B, dan C
    const tierQuota = {
      A: Math.round(importCount * 0.5),   // 50% Tier A (kappers, restaurants, garages)
      B: Math.round(importCount * 0.25),   // 25% Tier B (bouw, vastgoed)
      C: importCount - Math.round(importCount * 0.5) - Math.round(importCount * 0.25), // rest Tier C
    };

    const candidates = [];
    for (const [tier, quota] of Object.entries(tierQuota) as [string, number][]) {
      const tierPrefixes = SECTOR_TIERS[tier as keyof typeof SECTOR_TIERS]?.prefixes;
      if (!tierPrefixes || quota <= 0) continue;

      const tierFilters = buildCandidateFilters({
        ...baseFilters,
        naceWhitelist: [...tierPrefixes],
      });

      const tierCandidates = await db
        .select()
        .from(schema.kboCandidates)
        .where(tierFilters)
        .orderBy(desc(schema.kboCandidates.preScore))
        .limit(quota);

      candidates.push(...tierCandidates);
    }

    // Als een tier niet genoeg candidates heeft, vul aan met de volgende tier
    if (candidates.length < importCount) {
      const existingIds = new Set(candidates.map(c => c.id));
      const fallbackFilters = buildCandidateFilters(baseFilters);
      const fallback = await db
        .select()
        .from(schema.kboCandidates)
        .where(fallbackFilters)
        .orderBy(desc(schema.kboCandidates.preScore))
        .limit(importCount - candidates.length + 10);

      for (const c of fallback) {
        if (!existingIds.has(c.id) && candidates.length < importCount) {
          candidates.push(c);
          existingIds.add(c.id);
        }
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({ imported: 0, duplicates: 0, total: 0 });
    }

    // Create import log
    const [importLog] = await db
      .insert(schema.importLogs)
      .values({
        source: 'kbo_bulk',
        status: 'running',
        totalRecords: candidates.length,
      })
      .returning({ id: schema.importLogs.id });

    let imported = 0;
    let duplicates = 0;

    for (const candidate of candidates) {
      const [result] = await db
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
        .onConflictDoUpdate({
          target: [schema.businesses.registryId, schema.businesses.country],
          set: {
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
            updatedAt: new Date(),
          },
        })
        .returning({
          id: schema.businesses.id,
          createdAt: schema.businesses.createdAt,
          updatedAt: schema.businesses.updatedAt,
        });

      const isNew = Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000;

      if (isNew) {
        imported++;
        await db.insert(schema.leadStatuses).values({ businessId: result.id, status: 'new' });

        // Compute real score using scoring.ts (audit is null at import time)
        const scoreResult = computeScore({
          business: {
            website: candidate.website,
            foundedDate: candidate.foundedDate,
            naceCode: candidate.naceCode,
            legalForm: candidate.legalForm,
            email: candidate.email,
            phone: candidate.phone,
            googleRating: null,
            googleReviewCount: null,
            googleBusinessStatus: null,
            googlePhotosCount: null,
            hasGoogleBusinessProfile: null,
            googlePlacesEnrichedAt: null,
            recentReviewCount: null,
            reviewVelocity: null,
            googlePhotosCountPrev: null,
            googleBusinessUpdatedAt: null,
            hasGoogleAds: null,
            hasSocialMediaLinks: null,
            optOut: false,
          },
          audit: null,
        });

        await db.insert(schema.leadScores).values({
          businessId: result.id,
          totalScore: scoreResult.totalScore,
          scoreBreakdown: scoreResult.breakdown,
          maturityCluster: scoreResult.maturityCluster,
          disqualified: scoreResult.disqualified,
          dataCompleteness: scoreResult.dataCompleteness,
          estimatedScore: scoreResult.estimatedScore,
          disqualifyReason: scoreResult.disqualifyReason,
        });
        // Create pipeline entry
        await db.insert(schema.leadPipeline).values({ businessId: result.id, stage: 'new' });
      } else {
        duplicates++;
      }

      // Mark candidate as imported
      await db
        .update(schema.kboCandidates)
        .set({ status: 'imported', importedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.kboCandidates.id, candidate.id));
    }

    // Update import log
    await db
      .update(schema.importLogs)
      .set({
        status: 'completed',
        newRecords: imported,
        updatedRecords: duplicates,
        completedAt: new Date(),
      })
      .where(eq(schema.importLogs.id, importLog.id));

    return NextResponse.json({
      imported,
      duplicates,
      total: candidates.length,
      importLogId: importLog.id,
    });
  } catch (error) {
    console.error('Smart import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
