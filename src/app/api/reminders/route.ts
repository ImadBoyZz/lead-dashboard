import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? 'pending';

    const reminders = await db
      .select({
        reminder: schema.reminders,
        business: schema.businesses,
      })
      .from(schema.reminders)
      .innerJoin(schema.businesses, eq(schema.reminders.businessId, schema.businesses.id))
      .where(eq(schema.reminders.status, status as 'pending' | 'completed' | 'skipped'))
      .orderBy(schema.reminders.dueDate);

    return NextResponse.json(reminders);
  } catch (error) {
    console.error('Reminders error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const [reminder] = await db
      .insert(schema.reminders)
      .values({
        businessId: body.businessId,
        type: body.type,
        title: body.title,
        description: body.description,
        dueDate: new Date(body.dueDate),
      })
      .returning();
    return NextResponse.json(reminder, { status: 201 });
  } catch (error) {
    console.error('Create reminder error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
