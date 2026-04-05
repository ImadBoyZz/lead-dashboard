import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.status === 'completed') {
      updateData.status = 'completed';
      updateData.completedAt = new Date();
    } else if (body.status === 'skipped') {
      updateData.status = 'skipped';
    }

    if (body.title) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.dueDate) updateData.dueDate = new Date(body.dueDate);

    const [updated] = await db
      .update(schema.reminders)
      .set(updateData)
      .where(eq(schema.reminders.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update reminder error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    await db.delete(schema.reminders).where(eq(schema.reminders.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete reminder error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
