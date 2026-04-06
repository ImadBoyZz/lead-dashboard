import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

const reminderSchema = z.object({
  businessId: z.string().uuid(),
  type: z.enum(['follow_up', 'call', 'meeting_prep', 'check_in', 'custom']),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  dueDate: z.string().datetime(),
});

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
    const parsed = reminderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }
    const [reminder] = await db
      .insert(schema.reminders)
      .values({
        businessId: parsed.data.businessId,
        type: parsed.data.type,
        title: parsed.data.title,
        description: parsed.data.description,
        dueDate: new Date(parsed.data.dueDate),
      })
      .returning();
    return NextResponse.json(reminder, { status: 201 });
  } catch (error) {
    console.error('Create reminder error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
