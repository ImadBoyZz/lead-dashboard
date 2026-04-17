import { NextRequest, NextResponse } from 'next/server';
import { eq, sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidSession } from '@/lib/auth';

// Lichtgewicht count voor sidebar badge. Gecachet korte TTL client-side kan,
// server geeft altijd vers antwoord.
export async function GET(req: NextRequest) {
  if (!(await isValidSession(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [row] = await db
    .select({ count: dsql<number>`COUNT(*)::int` })
    .from(schema.outreachDrafts)
    .where(eq(schema.outreachDrafts.status, 'pending'));

  return NextResponse.json({ pending: row?.count ?? 0 });
}
