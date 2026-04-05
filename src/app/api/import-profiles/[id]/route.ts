import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const [profile] = await db
      .select()
      .from(schema.importProfiles)
      .where(eq(schema.importProfiles.id, id))
      .limit(1);
    if (!profile) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const body = await request.json();
    const [profile] = await db
      .update(schema.importProfiles)
      .set({
        name: body.name,
        description: body.description,
        filters: body.filters,
        batchSize: body.batchSize,
        isDefault: body.isDefault,
        updatedAt: new Date(),
      })
      .where(eq(schema.importProfiles.id, id))
      .returning();
    if (!profile) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    await db
      .delete(schema.importProfiles)
      .where(eq(schema.importProfiles.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
