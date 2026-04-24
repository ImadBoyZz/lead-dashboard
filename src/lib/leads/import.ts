// Gedeelde helper die Google-Places leads persisteert als `businesses` rijen
// met KBO-match + score + pipeline-stage. Gebruikt door:
//   - /api/leads/smart-import POST (handmatige UI flow)  — nog niet gemigreerd
//   - /api/daily-batch/discover (autonomous n8n flow)
//
// Heeft geen eigen auth-check of rate-limit; dat doet de caller.

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { computeScore } from '@/lib/scoring';
import { matchKboEnterprise, type KboMatchResult } from '@/lib/kbo/matcher';
import { extractPostcodeFromAddress } from '@/lib/kbo/normalize';
import type { DiscoveredLead } from '@/lib/places-discovery';

export interface ImportResult {
  imported: number;
  duplicates: number;
  total: number;
  importLogId: string;
}

/**
 * Persisteer ontdekte Google-Places leads. Idempotent via
 * `businesses.registryId + country` unique constraint.
 *
 * Voert per geïmporteerde lead: KBO-match, computeScore, leadStatus 'new',
 * leadPipeline 'new'. Schrijft 1 `importLogs` entry.
 */
export async function importDiscoveredLeads(
  sector: string,
  discoveredCity: string,
  leads: DiscoveredLead[],
): Promise<ImportResult> {
  const [importLog] = await db
    .insert(schema.importLogs)
    .values({
      source: 'google_places',
      status: 'running',
      totalRecords: leads.length,
    })
    .returning({ id: schema.importLogs.id });

  if (leads.length === 0) {
    await db
      .update(schema.importLogs)
      .set({ status: 'completed', newRecords: 0, updatedRecords: 0, completedAt: new Date() })
      .where(eq(schema.importLogs.id, importLog.id));
    return { imported: 0, duplicates: 0, total: 0, importLogId: importLog.id };
  }

  const businessValues = leads.map((lead) => ({
    registryId: lead.placeId,
    country: 'BE' as const,
    name: lead.name,
    street: lead.address || null,
    city: discoveredCity,
    sector,
    website: lead.website,
    phone: lead.phone,
    googlePlaceId: lead.placeId,
    googleRating: lead.rating,
    googleReviewCount: lead.reviewCount,
    googleBusinessStatus: lead.businessStatus,
    googlePhotosCount: lead.photosCount,
    hasGoogleBusinessProfile: true,
    googlePlacesEnrichedAt: new Date(),
    chainWarning: lead.chainWarning,
    dataSource: 'google_places' as const,
  }));

  const insertedBusinesses = await db
    .insert(schema.businesses)
    .values(businessValues)
    .onConflictDoNothing({
      target: [schema.businesses.registryId, schema.businesses.country],
    })
    .returning({
      id: schema.businesses.id,
      registryId: schema.businesses.registryId,
    });

  const imported = insertedBusinesses.length;
  const duplicates = leads.length - imported;

  if (imported > 0) {
    const idByPlaceId = new Map(insertedBusinesses.map((b) => [b.registryId, b.id]));

    const kboByBusinessId = new Map<string, KboMatchResult | null>();
    const now = new Date();
    await Promise.all(
      leads.map(async (lead) => {
        const businessId = idByPlaceId.get(lead.placeId);
        if (!businessId) return;
        const postcode = extractPostcodeFromAddress(lead.address);
        const match = await matchKboEnterprise({ name: lead.name, postalCode: postcode });
        kboByBusinessId.set(businessId, match);
        if (match) {
          await db
            .update(schema.businesses)
            .set({
              kboEnterpriseNumber: match.enterpriseNumber,
              kboMatchConfidence: match.confidence,
              kboMatchedAt: now,
              foundedDate: match.foundedDate,
              naceCode: match.naceCode,
              legalForm: match.legalForm,
              postalCode: postcode ?? undefined,
              updatedAt: now,
            })
            .where(eq(schema.businesses.id, businessId));
        } else {
          await db
            .update(schema.businesses)
            .set({ kboMatchedAt: now, updatedAt: now, postalCode: postcode ?? undefined })
            .where(eq(schema.businesses.id, businessId));
        }
      }),
    );

    const statusValues: { businessId: string; status: 'new' }[] = [];
    const scoreValues: {
      businessId: string;
      totalScore: number;
      scoreBreakdown: Record<string, unknown>;
      maturityCluster: string;
      disqualified: boolean;
      disqualifyReason: string | null;
    }[] = [];
    const pipelineValues: { businessId: string; stage: 'new' }[] = [];

    for (const lead of leads) {
      const businessId = idByPlaceId.get(lead.placeId);
      if (!businessId) continue;

      statusValues.push({ businessId, status: 'new' });
      const kboMatch = kboByBusinessId.get(businessId);

      const scoreResult = computeScore({
        business: {
          website: lead.website,
          foundedDate: kboMatch?.foundedDate ?? null,
          naceCode: kboMatch?.naceCode ?? null,
          legalForm: kboMatch?.legalForm ?? null,
          email: null,
          phone: lead.phone,
          googleRating: lead.rating,
          googleReviewCount: lead.reviewCount,
          googleBusinessStatus: lead.businessStatus,
          googlePhotosCount: lead.photosCount,
          hasGoogleBusinessProfile: true,
          googlePlacesEnrichedAt: new Date(),
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

      scoreValues.push({
        businessId,
        totalScore: scoreResult.totalScore,
        scoreBreakdown: scoreResult.breakdown as Record<string, unknown>,
        maturityCluster: scoreResult.maturityCluster,
        disqualified: scoreResult.disqualified,
        disqualifyReason: scoreResult.disqualifyReason,
      });

      pipelineValues.push({ businessId, stage: 'new' });
    }

    await Promise.all([
      db.insert(schema.leadStatuses).values(statusValues),
      db.insert(schema.leadScores).values(scoreValues),
      db.insert(schema.leadPipeline).values(pipelineValues),
    ]);
  }

  await db
    .update(schema.importLogs)
    .set({
      status: 'completed',
      newRecords: imported,
      updatedRecords: duplicates,
      completedAt: new Date(),
    })
    .where(eq(schema.importLogs.id, importLog.id));

  return { imported, duplicates, total: leads.length, importLogId: importLog.id };
}
