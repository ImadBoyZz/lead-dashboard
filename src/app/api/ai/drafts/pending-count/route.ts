import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidSession } from '@/lib/auth';

// Lichtgewicht count voor sidebar badge. Gecachet korte TTL client-side kan,
// server geeft altijd vers antwoord.
// Filters moeten exact matchen met /review page (review/page.tsx) anders
// toont de sidebar een count die niet overeenkomt met wat de pagina laat zien.
export async function GET(req: NextRequest) {
  if (!(await isValidSession(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [row] = await db
    .select({ count: dsql<number>`COUNT(*)::int` })
    .from(schema.outreachDrafts)
    .innerJoin(
      schema.businesses,
      eq(schema.outreachDrafts.businessId, schema.businesses.id),
    )
    .where(
      and(
        eq(schema.outreachDrafts.status, 'pending'),
        eq(schema.businesses.optOut, false),
        eq(schema.businesses.blacklisted, false),
      ),
    );

  return NextResponse.json({ pending: row?.count ?? 0 });
}
