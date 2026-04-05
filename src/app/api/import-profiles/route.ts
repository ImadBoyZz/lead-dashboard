import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const profiles = await db
      .select()
      .from(schema.importProfiles)
      .orderBy(desc(schema.importProfiles.createdAt));
    return NextResponse.json(profiles);
  } catch (error) {
    console.error('Import profiles error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const [profile] = await db
      .insert(schema.importProfiles)
      .values({
        name: body.name,
        description: body.description,
        filters: body.filters ?? {},
        batchSize: body.batchSize ?? 50,
        isDefault: body.isDefault ?? false,
      })
      .returning();
    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    console.error('Create profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
