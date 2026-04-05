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
    const [updated] = await db
      .update(schema.outreachTemplates)
      .set({
        name: body.name,
        channel: body.channel,
        subject: body.subject,
        body: body.body,
        variables: body.variables,
        isDefault: body.isDefault,
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
