import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

const templateUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  channel: z.enum(['email', 'phone', 'linkedin', 'whatsapp', 'in_person']).optional(),
  subject: z.string().max(500).optional(),
  body: z.string().min(1).max(5000).optional(),
  variables: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const [template] = await db
      .select()
      .from(schema.outreachTemplates)
      .where(eq(schema.outreachTemplates.id, id))
      .limit(1);
    if (!template) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(template);
  } catch (error) {
    console.error('Get template error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = templateUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }
    const [updated] = await db
      .update(schema.outreachTemplates)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(schema.outreachTemplates.id, id))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update template error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    await db.delete(schema.outreachTemplates).where(eq(schema.outreachTemplates.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete template error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
