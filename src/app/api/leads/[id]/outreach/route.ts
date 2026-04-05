import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { autoTransitionOnOutreach } from '@/lib/pipeline-logic';
import { createAutoReminder } from '@/lib/auto-reminders';

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

    const [log] = await db
      .insert(schema.outreachLog)
      .values({
        businessId: id,
        channel: body.channel,
        subject: body.subject,
        content: body.content,
        outcome: body.outcome,
        structuredOutcome: body.structuredOutcome ?? null,
        durationMinutes: body.durationMinutes,
        nextAction: body.nextAction,
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
    await autoTransitionOnOutreach(id, body.channel);

    // Create auto reminder
    await createAutoReminder(id, body.channel, body.outcome);

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error('Log outreach error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
