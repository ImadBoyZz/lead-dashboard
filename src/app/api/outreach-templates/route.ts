import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

const templateSchema = z.object({
  name: z.string().min(1).max(200),
  channel: z.enum(['email', 'phone', 'linkedin', 'whatsapp', 'in_person']),
  subject: z.string().max(500).optional(),
  body: z.string().min(1).max(5000),
  variables: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

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
    const parsed = templateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }
    const [template] = await db
      .insert(schema.outreachTemplates)
      .values({
        name: parsed.data.name,
        channel: parsed.data.channel,
        subject: parsed.data.subject,
        body: parsed.data.body,
        variables: parsed.data.variables ?? [],
        isDefault: parsed.data.isDefault ?? false,
      })
      .returning();
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Create template error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
