import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidSession } from '@/lib/auth';

const patchSchema = z.object({
  status: z.enum(['approved', 'rejected']).optional(),
  body: z.string().optional(),
  subject: z.string().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!(await isValidSession(request))) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validatie mislukt', details: parsed.error.flatten() }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.body !== undefined) updates.body = parsed.data.body;
    if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject;

    const [updated] = await db
      .update(schema.outreachDrafts)
      .set(updates)
      .where(eq(schema.outreachDrafts.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update draft error:', error);
    return NextResponse.json({ error: 'Interne serverfout' }, { status: 500 });
  }
}
