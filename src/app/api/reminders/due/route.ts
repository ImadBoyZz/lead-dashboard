import { NextRequest, NextResponse } from 'next/server';
import { and, eq, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

function authenticateN8n(request: Request): boolean {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  return auth.slice(7) === process.env.N8N_WEBHOOK_SECRET;
}

export async function GET(request: NextRequest) {
  if (!authenticateN8n(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const reminders = await db
      .select({
        reminder: schema.reminders,
        business: schema.businesses,
      })
      .from(schema.reminders)
      .innerJoin(schema.businesses, eq(schema.reminders.businessId, schema.businesses.id))
      .where(
        and(
          eq(schema.reminders.status, 'pending'),
          lte(schema.reminders.dueDate, now),
        )
      )
      .orderBy(schema.reminders.dueDate);

    return NextResponse.json(reminders);
  } catch (error) {
    console.error('Due reminders error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
