import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  eq,
  and,
  desc,
  asc,
  sql,
  ilike,
  gte,
  lte,
  count,
  isNull,
  isNotNull,
  or,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

// ── GET: Filtered paginated lead list ─────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const country = searchParams.get('country') as 'BE' | 'NL' | null;
    const province = searchParams.get('province');
    const status = searchParams.get('status');
    const scoreMin = searchParams.get('scoreMin');
    const scoreMax = searchParams.get('scoreMax');
    const search = searchParams.get('search');
    const naceCode = searchParams.get('naceCode');
    const hasWebsite = searchParams.get('hasWebsite');
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('limit') ?? '25', 10)),
    );
    const sort = searchParams.get('sort') ?? 'score';
    const order = searchParams.get('order') ?? (sort === 'score' ? 'desc' : 'asc');
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const conditions = [];
    conditions.push(eq(schema.businesses.optOut, false));

    if (country) {
      conditions.push(eq(schema.businesses.country, country));
    }
    if (province) {
      conditions.push(eq(schema.businesses.province, province));
    }
    if (status) {
      conditions.push(
        eq(
          schema.leadStatuses.status,
          status as
            | 'new'
            | 'contacted'
            | 'replied'
            | 'meeting'
            | 'won'
            | 'lost'
            | 'disqualified',
        ),
      );
    }
    if (scoreMin) {
      conditions.push(gte(schema.leadScores.totalScore, parseInt(scoreMin, 10)));
    }
    if (scoreMax) {
      conditions.push(lte(schema.leadScores.totalScore, parseInt(scoreMax, 10)));
    }
    if (search) {
      conditions.push(
        or(
          ilike(schema.businesses.name, `%${search}%`),
          ilike(schema.businesses.city, `%${search}%`),
        ),
      );
    }
    if (naceCode) {
      conditions.push(eq(schema.businesses.naceCode, naceCode));
    }
    if (hasWebsite === 'true') {
      conditions.push(isNotNull(schema.businesses.website));
    } else if (hasWebsite === 'false') {
      conditions.push(isNull(schema.businesses.website));
    }

    const whereClause = and(...conditions);

    // Determine sort column
    const sortDirection = order === 'asc' ? asc : desc;
    let orderByColumn;
    switch (sort) {
      case 'name':
        orderByColumn = sortDirection(schema.businesses.name);
        break;
      case 'city':
        orderByColumn = sortDirection(schema.businesses.city);
        break;
      case 'founded':
        orderByColumn = sortDirection(schema.businesses.foundedDate);
        break;
      case 'recent':
        orderByColumn = sortDirection(schema.businesses.createdAt);
        break;
      case 'score':
      default:
        orderByColumn = sortDirection(schema.leadScores.totalScore);
        break;
    }

    // Count total
    const [totalResult] = await db
      .select({ count: count() })
      .from(schema.businesses)
      .leftJoin(
        schema.leadScores,
        eq(schema.businesses.id, schema.leadScores.businessId),
      )
      .leftJoin(
        schema.leadStatuses,
        eq(schema.businesses.id, schema.leadStatuses.businessId),
      )
      .where(whereClause);

    const total = totalResult.count;

    // Fetch data
    const data = await db
      .select({
        business: schema.businesses,
        score: schema.leadScores,
        status: schema.leadStatuses,
      })
      .from(schema.businesses)
      .leftJoin(
        schema.leadScores,
        eq(schema.businesses.id, schema.leadScores.businessId),
      )
      .leftJoin(
        schema.leadStatuses,
        eq(schema.businesses.id, schema.leadStatuses.businessId),
      )
      .where(whereClause)
      .orderBy(orderByColumn)
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      data: data.map((row) => ({
        ...row.business,
        score: row.score,
        status: row.status,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Leads GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ── POST: Manual lead creation ────────────────────────

const createLeadSchema = z.object({
  registryId: z.string(),
  country: z.enum(['BE', 'NL']),
  name: z.string(),
  legalForm: z.string().optional(),
  naceCode: z.string().optional(),
  naceDescription: z.string().optional(),
  foundedDate: z.string().optional(),
  street: z.string().optional(),
  houseNumber: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  website: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  googlePlaceId: z.string().optional(),
  googleRating: z.number().optional(),
  googleReviewCount: z.number().optional(),
  dataSource: z
    .enum(['kbo_bulk', 'kvk_open', 'google_places', 'manual'])
    .default('manual'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createLeadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const [business] = await db
      .insert(schema.businesses)
      .values({
        registryId: data.registryId,
        country: data.country,
        name: data.name,
        legalForm: data.legalForm,
        naceCode: data.naceCode,
        naceDescription: data.naceDescription,
        foundedDate: data.foundedDate,
        street: data.street,
        houseNumber: data.houseNumber,
        postalCode: data.postalCode,
        city: data.city,
        province: data.province,
        website: data.website,
        email: data.email,
        phone: data.phone,
        googlePlaceId: data.googlePlaceId,
        googleRating: data.googleRating,
        googleReviewCount: data.googleReviewCount,
        dataSource: data.dataSource,
      })
      .returning();

    // Create default lead status
    await db.insert(schema.leadStatuses).values({
      businessId: business.id,
      status: 'new',
    });

    // Create default lead score
    await db.insert(schema.leadScores).values({
      businessId: business.id,
      totalScore: 0,
    });

    return NextResponse.json(business, { status: 201 });
  } catch (error) {
    console.error('Leads POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
