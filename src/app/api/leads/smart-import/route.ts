import { NextRequest, NextResponse } from 'next/server';
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

// POST — Import discovered leads into businesses + scoring + pipeline
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sector, city, selectedPlaceIds, count = 25 } = body as {
      sector: string;
      city: string;
      selectedPlaceIds?: string[];
      count?: number;
    };

    if (!sector || !city) {
      return NextResponse.json(
        { error: 'Missing required fields: sector and city' },
        { status: 400 },
      );
    }

    // Gebruik dezelfde multi-query logica als de GET preview
    const subsectors = buildSearchQueries(sector, city, 99);
    const selectedSet = selectedPlaceIds ? new Set(selectedPlaceIds) : null;
    const seenPlaceIds = new Set<string>();
    let allLeads: Awaited<ReturnType<typeof discoverLeads>>['leads'] = [];

    for (const query of subsectors) {
      if (allLeads.length >= count) break;
      const result = await discoverLeads(query, 60, city);
      for (const lead of result.leads) {
        if (!seenPlaceIds.has(lead.placeId)) {
          seenPlaceIds.add(lead.placeId);
          if (!selectedSet || selectedSet.has(lead.placeId)) {
            allLeads.push(lead);
          }
        }
      }
    }

    const toImport = allLeads.slice(0, count);

    if (toImport.length === 0) {
      return NextResponse.json({ imported: 0, duplicates: 0, total: 0 });
    }

    // Create import log
    const [importLog] = await db
      .insert(schema.importLogs)
      .values({
        source: 'google_places',
        status: 'running',
        totalRecords: toImport.length,
      })
      .returning({ id: schema.importLogs.id });

    let imported = 0;
    let duplicates = 0;

    for (const lead of toImport) {
      const [result] = await db
        .insert(schema.businesses)
        .values({
          registryId: lead.placeId,
          country: 'BE',
          name: lead.name,
          street: lead.address || null,
          city: city,
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
          dataSource: 'google_places',
        })
        .onConflictDoNothing({
          target: [schema.businesses.registryId, schema.businesses.country],
        })
        .returning({
          id: schema.businesses.id,
        });

      // If onConflictDoNothing returned nothing, it's a duplicate
      if (!result) {
        duplicates++;
        continue;
      }

      imported++;

      // Create lead status
      await db.insert(schema.leadStatuses).values({
        businessId: result.id,
        status: 'new',
      });

      // Compute score with all available Google data
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

      // Insert lead score
      await db.insert(schema.leadScores).values({
        businessId: result.id,
        totalScore: scoreResult.totalScore,
        scoreBreakdown: scoreResult.breakdown,
        maturityCluster: scoreResult.maturityCluster,
        disqualified: scoreResult.disqualified,
        disqualifyReason: scoreResult.disqualifyReason,
      });

      // Create pipeline entry
      await db.insert(schema.leadPipeline).values({
        businessId: result.id,
        stage: 'new',
      });
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
