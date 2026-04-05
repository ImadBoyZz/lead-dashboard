import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

export async function GET() {
  try {
    const templates = await db
      .select()
      .from(schema.outreachTemplates)
      .orderBy(desc(schema.outreachTemplates.createdAt));
    return NextResponse.json(templates);
  } catch (error) {
    console.error('Templates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const [template] = await db
      .insert(schema.outreachTemplates)
      .values({
        name: body.name,
        channel: body.channel,
        subject: body.subject,
        body: body.body,
        variables: body.variables ?? [],
        isDefault: body.isDefault ?? false,
      })
      .returning();
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Create template error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
