import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { updatePipelineStage } from '@/lib/pipeline-logic';

const pipelineUpdateSchema = z.object({
  stage: z.enum(['new', 'contacted', 'quote_sent', 'meeting', 'won', 'ignored']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  dealValue: z.number().min(0).optional(),
  estimatedCloseDate: z.string().optional(),
  nextFollowUpAt: z.string().optional(),
  followUpNote: z.string().max(1000).optional(),
  lostReason: z.string().max(500).optional(),
  meetingAt: z.string().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = pipelineUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    // If stage is changing, use pipeline logic for sync
    if (parsed.data.stage) {
      const [current] = await db
        .select()
        .from(schema.leadPipeline)
        .where(eq(schema.leadPipeline.id, id))
        .limit(1);

      if (current) {
        const meetingDate = parsed.data.meetingAt ? new Date(parsed.data.meetingAt) : undefined;
        await updatePipelineStage(current.businessId, parsed.data.stage, current.stage, meetingDate);
      }
    }

    // Update other fields
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.priority) updateData.priority = parsed.data.priority;
    if (parsed.data.dealValue !== undefined) updateData.dealValue = parsed.data.dealValue;
    if (parsed.data.estimatedCloseDate !== undefined) updateData.estimatedCloseDate = parsed.data.estimatedCloseDate;
    if (parsed.data.nextFollowUpAt !== undefined) updateData.nextFollowUpAt = parsed.data.nextFollowUpAt;
    if (parsed.data.followUpNote !== undefined) updateData.followUpNote = parsed.data.followUpNote;
    if (parsed.data.lostReason !== undefined) updateData.lostReason = parsed.data.lostReason;

    // Sync meetingAt to leadStatuses if provided
    if (parsed.data.meetingAt !== undefined) {
      const [current] = await db
        .select({ businessId: schema.leadPipeline.businessId })
        .from(schema.leadPipeline)
        .where(eq(schema.leadPipeline.id, id))
        .limit(1);

      if (current) {
        await db
          .update(schema.leadStatuses)
          .set({ meetingAt: new Date(parsed.data.meetingAt) })
          .where(eq(schema.leadStatuses.businessId, current.businessId));
      }
    }

    const [updated] = await db
      .update(schema.leadPipeline)
      .set(updateData)
      .where(eq(schema.leadPipeline.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Pipeline update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
