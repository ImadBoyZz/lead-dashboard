import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { autoTransitionOnOutreach } from '@/lib/pipeline-logic';
import { createAutoReminder } from '@/lib/auto-reminders';

const outreachSchema = z.object({
  channel: z.enum(['email', 'phone', 'linkedin', 'whatsapp', 'in_person']),
  subject: z.string().max(500).optional(),
  content: z.string().max(5000).optional(),
  outcome: z.string().max(500).optional(),
  structuredOutcome: z.enum(['no_answer', 'voicemail', 'callback_requested', 'interested', 'not_interested', 'meeting_booked', 'wrong_contact', 'other']).optional(),
  durationMinutes: z.number().int().min(0).max(480).optional(),
  nextAction: z.string().max(500).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const logs = await db
      .select()
      .from(schema.outreachLog)
      .where(eq(schema.outreachLog.businessId, id))
      .orderBy(desc(schema.outreachLog.contactedAt));
    return NextResponse.json(logs);
  } catch (error) {
    console.error('Outreach history error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = outreachSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const [log] = await db
      .insert(schema.outreachLog)
      .values({
        businessId: id,
        channel: parsed.data.channel,
        subject: parsed.data.subject,
        content: parsed.data.content,
        outcome: parsed.data.outcome,
        structuredOutcome: parsed.data.structuredOutcome ?? null,
        durationMinutes: parsed.data.durationMinutes,
        nextAction: parsed.data.nextAction,
      })
      .returning();

    // Update pipeline outreach count and last outreach timestamp
    await db
      .update(schema.leadPipeline)
      .set({
        lastOutreachAt: new Date(),
        outreachCount: sql`${schema.leadPipeline.outreachCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.leadPipeline.businessId, id));

    // Auto-transition pipeline stage
    await autoTransitionOnOutreach(id, parsed.data.channel);

    // Create auto reminder
    await createAutoReminder(id, parsed.data.channel, parsed.data.outcome);

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error('Log outreach error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
