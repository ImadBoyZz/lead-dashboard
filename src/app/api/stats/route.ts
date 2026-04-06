import { NextResponse } from 'next/server';
import { eq, sql, count, avg } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

export async function GET() {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Alle 6 queries parallel uitvoeren (voorheen sequentieel)
    const [
      [totalResult],
      statusCounts,
      scoreRanges,
      countryCounts,
      [newThisWeekResult],
      [avgResult],
    ] = await Promise.all([
      // Total leads
      db
        .select({ count: count() })
        .from(schema.businesses)
        .where(eq(schema.businesses.optOut, false)),

      // By status
      db
        .select({
          status: schema.leadStatuses.status,
          count: count(),
        })
        .from(schema.leadStatuses)
        .innerJoin(
          schema.businesses,
          eq(schema.leadStatuses.businessId, schema.businesses.id),
        )
        .where(eq(schema.businesses.optOut, false))
        .groupBy(schema.leadStatuses.status),

      // By score range
      db
        .select({
          range: sql<string>`
            CASE
              WHEN ${schema.leadScores.totalScore} >= 70 THEN 'hot'
              WHEN ${schema.leadScores.totalScore} >= 40 THEN 'warm'
              ELSE 'cold'
            END
          `,
          count: count(),
        })
        .from(schema.leadScores)
        .innerJoin(
          schema.businesses,
          eq(schema.leadScores.businessId, schema.businesses.id),
        )
        .where(eq(schema.businesses.optOut, false))
        .groupBy(
          sql`CASE
            WHEN ${schema.leadScores.totalScore} >= 70 THEN 'hot'
            WHEN ${schema.leadScores.totalScore} >= 40 THEN 'warm'
            ELSE 'cold'
          END`,
        ),

      // By country
      db
        .select({
          country: schema.businesses.country,
          count: count(),
        })
        .from(schema.businesses)
        .where(eq(schema.businesses.optOut, false))
        .groupBy(schema.businesses.country),

      // New this week
      db
        .select({ count: count() })
        .from(schema.businesses)
        .where(
          sql`${schema.businesses.optOut} = false AND ${schema.businesses.createdAt} >= ${oneWeekAgo}`,
        ),

      // Average score
      db
        .select({ avg: avg(schema.leadScores.totalScore) })
        .from(schema.leadScores)
        .innerJoin(
          schema.businesses,
          eq(schema.leadScores.businessId, schema.businesses.id),
        )
        .where(eq(schema.businesses.optOut, false)),
    ]);

    const totalLeads = totalResult.count;

    const byStatus: Record<string, number> = {
      new: 0,
      contacted: 0,
      replied: 0,
      meeting: 0,
      won: 0,
      lost: 0,
      disqualified: 0,
    };
    for (const row of statusCounts) {
      byStatus[row.status] = row.count;
    }

    const byScoreRange: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
    for (const row of scoreRanges) {
      byScoreRange[row.range] = row.count;
    }

    const byCountry: Record<string, number> = { BE: 0, NL: 0 };
    for (const row of countryCounts) {
      byCountry[row.country] = row.count;
    }

    const newThisWeek = newThisWeekResult.count;
    const averageScore = Math.round(Number(avgResult.avg) || 0);

    return NextResponse.json({
      totalLeads,
      byStatus,
      byScoreRange,
      byCountry,
      newThisWeek,
      averageScore,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
