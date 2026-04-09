import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { env } from '@/lib/env';

function authenticateN8n(request: Request): boolean {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const secret = env.N8N_WEBHOOK_SECRET;
  if (!token || !secret) return false;
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (tokenBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(tokenBuf, secretBuf);
}

const businessSchema = z.object({
  registryId: z.string(),
  country: z.enum(['BE', 'NL']),
  name: z.string(),
  legalForm: z.string().nullish(),
  naceCode: z.string().nullish(),
  naceDescription: z.string().nullish(),
  foundedDate: z.string().nullish(),
  street: z.string().nullish(),
  houseNumber: z.string().nullish(),
  postalCode: z.string().nullish(),
  city: z.string().nullish(),
  province: z.string().nullish(),
  website: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  googlePlaceId: z.string().nullish(),
  googleRating: z.number().nullish(),
  googleReviewCount: z.number().nullish(),
  dataSource: z.enum(['google_places', 'manual']),
});

const syncSchema = z.object({
  businesses: z.array(businessSchema),
});

export async function POST(request: NextRequest) {
  if (!authenticateN8n(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let importLogId: string | undefined;

  try {
    const body = await request.json();
    const parsed = syncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { businesses } = parsed.data;

    // Create import log
    const [importLog] = await db
      .insert(schema.importLogs)
      .values({
        source: businesses[0]?.dataSource ?? 'manual',
        status: 'running',
        totalRecords: businesses.length,
      })
      .returning({ id: schema.importLogs.id });

    importLogId = importLog.id;

    // Batch upsert all businesses (1 query instead of N)
    const upsertValues = businesses.map((biz) => ({
      registryId: biz.registryId,
      country: biz.country,
      name: biz.name,
      legalForm: biz.legalForm,
      naceCode: biz.naceCode,
      naceDescription: biz.naceDescription,
      foundedDate: biz.foundedDate,
      street: biz.street,
      houseNumber: biz.houseNumber,
      postalCode: biz.postalCode,
      city: biz.city,
      province: biz.province,
      website: biz.website,
      email: biz.email,
      phone: biz.phone,
      googlePlaceId: biz.googlePlaceId,
      googleRating: biz.googleRating,
      googleReviewCount: biz.googleReviewCount,
      dataSource: biz.dataSource,
    }));

    const results = await db
      .insert(schema.businesses)
      .values(upsertValues)
      .onConflictDoUpdate({
        target: [schema.businesses.registryId, schema.businesses.country],
        set: {
          name: sql`excluded.name`,
          legalForm: sql`excluded.legal_form`,
          naceCode: sql`excluded.nace_code`,
          naceDescription: sql`excluded.nace_description`,
          foundedDate: sql`excluded.founded_date`,
          street: sql`excluded.street`,
          houseNumber: sql`excluded.house_number`,
          postalCode: sql`excluded.postal_code`,
          city: sql`excluded.city`,
          province: sql`excluded.province`,
          website: sql`excluded.website`,
          email: sql`excluded.email`,
          phone: sql`excluded.phone`,
          googlePlaceId: sql`excluded.google_place_id`,
          googleRating: sql`excluded.google_rating`,
          googleReviewCount: sql`excluded.google_review_count`,
          dataSource: sql`excluded.data_source`,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: schema.businesses.id,
        createdAt: schema.businesses.createdAt,
        updatedAt: schema.businesses.updatedAt,
      });

    // Determine which are new inserts vs updates
    const newBusinessIds: string[] = [];
    let updated = 0;

    for (const result of results) {
      const isNew =
        Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000;
      if (isNew) {
        newBusinessIds.push(result.id);
      } else {
        updated++;
      }
    }

    const inserted = newBusinessIds.length;

    // Batch insert child records for new businesses only (2 queries instead of 2N)
    if (newBusinessIds.length > 0) {
      await Promise.all([
        db.insert(schema.leadStatuses).values(
          newBusinessIds.map((id) => ({ businessId: id, status: 'new' as const }))
        ),
        db.insert(schema.leadScores).values(
          newBusinessIds.map((id) => ({ businessId: id, totalScore: 0 }))
        ),
      ]);
    }

    // Update import log to completed
    await db
      .update(schema.importLogs)
      .set({
        status: 'completed',
        newRecords: inserted,
        updatedRecords: updated,
        completedAt: new Date(),
      })
      .where(eq(schema.importLogs.id, importLogId));

    return NextResponse.json(
      { inserted, updated, total: businesses.length },
      { status: 200 },
    );
  } catch (error) {
    // Update import log to failed if it was created
    if (importLogId) {
      await db
        .update(schema.importLogs)
        .set({
          status: 'failed',
          errorDetails: {
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          completedAt: new Date(),
        })
        .where(eq(schema.importLogs.id, importLogId));
    }

    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
