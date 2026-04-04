import { NextRequest, NextResponse } from 'next/server';
import {
  eq,
  and,
  ilike,
  gte,
  lte,
  isNull,
  isNotNull,
  or,
  desc,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

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
      .orderBy(desc(schema.leadScores.totalScore));

    // Build CSV
    const headers = [
      'Naam',
      'Land',
      'Stad',
      'Provincie',
      'Postcode',
      'Website',
      'Email',
      'Telefoon',
      'Score',
      'Status',
      'NACE Code',
      'Opgericht',
      'Google Rating',
      'Google Reviews',
    ];

    function escapeCsv(value: string | number | null | undefined): string {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    const rows = data.map((row) =>
      [
        escapeCsv(row.business.name),
        escapeCsv(row.business.country),
        escapeCsv(row.business.city),
        escapeCsv(row.business.province),
        escapeCsv(row.business.postalCode),
        escapeCsv(row.business.website),
        escapeCsv(row.business.email),
        escapeCsv(row.business.phone),
        escapeCsv(row.score?.totalScore),
        escapeCsv(row.status?.status),
        escapeCsv(row.business.naceCode),
        escapeCsv(row.business.foundedDate),
        escapeCsv(row.business.googleRating),
        escapeCsv(row.business.googleReviewCount),
      ].join(','),
    );

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const dateStr = new Date().toISOString().split('T')[0];

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=leads-export-${dateStr}.csv`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
