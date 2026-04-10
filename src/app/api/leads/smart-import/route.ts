import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { discoverLeads, buildSearchQueries, detectBatchDuplicates } from '@/lib/places-discovery';
import { computeScore } from '@/lib/scoring';
import { rateLimit } from '@/lib/rate-limit';

// GET — Preview: discover leads from Google Places, deduplicate, return without saving
export async function GET(request: NextRequest) {
  try {
    const { allowed } = rateLimit('smart-import', 20, 60 * 1000); // 20 per minuut
    if (!allowed) {
      return NextResponse.json({ error: 'Te veel verzoeken. Probeer over een minuut opnieuw.' }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const sector = searchParams.get('sector');
    const city = searchParams.get('city');

    if (!sector || !city) {
      return NextResponse.json(
        { error: 'Missing required query params: sector and city' },
        { status: 400 },
      );
    }

    const target = Math.min(parseInt(searchParams.get('target') ?? '20', 10), 200);
    // Gebruik alle subsectors van de sector voor maximale dekking
    const subsectors = buildSearchQueries(sector, city, 99);

    // Fetch tot we het target bereiken of alles op is
    let allLeads: Awaited<ReturnType<typeof discoverLeads>>['leads'] = [];
    let fromMock = false;
    const seenPlaceIds = new Set<string>();

    for (const query of subsectors) {
      if (allLeads.length >= target) break;

      const remaining = target - allLeads.length;
      const result = await discoverLeads(query, remaining, city);
      fromMock = fromMock || result.fromMock;
      for (const lead of result.leads) {
        if (!seenPlaceIds.has(lead.placeId)) {
          seenPlaceIds.add(lead.placeId);
          allLeads.push(lead);
        }
      }
    }

    // Sorteer op kwaliteitsscore en beperk tot target
    allLeads.sort((a, b) => b.qualityScore - a.qualityScore);
    const leads = allLeads.slice(0, target);

    // Deduplicate against existing businesses by googlePlaceId
    const placeIds = leads.map((l) => l.placeId);
    let existingPlaceIds = new Set<string>();

    if (placeIds.length > 0) {
      const existing = await db
        .select({ googlePlaceId: schema.businesses.googlePlaceId })
        .from(schema.businesses)
        .where(inArray(schema.businesses.googlePlaceId, placeIds));

      existingPlaceIds = new Set(
        existing
          .map((r) => r.googlePlaceId)
          .filter((id): id is string => id !== null),
      );
    }

    const newLeads = leads.filter((l) => !existingPlaceIds.has(l.placeId));
    const alreadyImported = leads.length - newLeads.length;

    // Batch-level keten-detectie (duplicaat namen)
    detectBatchDuplicates(newLeads);

    return NextResponse.json({
      leads: newLeads,
      total: leads.length,
      alreadyImported,
      fromMock,
    });
  } catch (error) {
    console.error('Smart import preview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const previewLeadSchema = z.object({
  placeId: z.string().min(1),
  name: z.string().min(1),
  address: z.string(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().nullable(),
  businessStatus: z.string().default('OPERATIONAL'),
  photosCount: z.number().default(0),
  googleMapsUri: z.string().nullable(),
  hasWebsite: z.boolean(),
  qualityScore: z.number(),
  chainWarning: z.string().nullable(),
  discoveredInCity: z.string().min(1),
});

const importSchema = z.object({
  sector: z.string().min(1),
  leads: z.array(previewLeadSchema).min(1).max(200),
});

// POST — Import discovered leads into businesses + scoring + pipeline
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { sector, leads: toImport } = parsed.data;

    if (toImport.length === 0) {
      return NextResponse.json({ imported: 0, duplicates: 0, total: 0 });
    }

    // Create import log VOOR de insert (was eerder NA de loop)
    const [importLog] = await db
      .insert(schema.importLogs)
      .values({
        source: 'google_places',
        status: 'running',
        totalRecords: toImport.length,
      })
      .returning({ id: schema.importLogs.id });

    // Batch insert businesses (1 query instead of N)
    const businessValues = toImport.map((lead) => ({
      registryId: lead.placeId,
      country: 'BE' as const,
      name: lead.name,
      street: lead.address || null,
      city: lead.discoveredInCity,
      sector: sector,
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
    const duplicates = toImport.length - imported;

    if (imported > 0) {
      // Map inserted business IDs back to lead data for scoring
      const idByPlaceId = new Map(
        insertedBusinesses.map((b) => [b.registryId, b.id])
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

      for (const lead of toImport) {
        const businessId = idByPlaceId.get(lead.placeId);
        if (!businessId) continue; // was a duplicate

        statusValues.push({ businessId, status: 'new' });

        const scoreResult = computeScore({
          business: {
            website: lead.website,
            foundedDate: null,
            naceCode: null,
            legalForm: null,
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

      // Batch insert child records (3 queries instead of 3N)
      await Promise.all([
        db.insert(schema.leadStatuses).values(statusValues),
        db.insert(schema.leadScores).values(scoreValues),
        db.insert(schema.leadPipeline).values(pipelineValues),
      ]);
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
      total: toImport.length,
    });
  } catch (error) {
    console.error('Smart import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
