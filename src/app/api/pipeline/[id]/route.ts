import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { updatePipelineStage } from '@/lib/pipeline-logic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const body = await request.json();

    // If stage is changing, use pipeline logic for sync
    if (body.stage) {
      const [current] = await db
        .select()
        .from(schema.leadPipeline)
        .where(eq(schema.leadPipeline.id, id))
        .limit(1);

      if (current) {
        await updatePipelineStage(current.businessId, body.stage, current.stage);
      }
    }

    // Update other fields
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.priority) updateData.priority = body.priority;
    if (body.dealValue !== undefined) updateData.dealValue = body.dealValue;
    if (body.estimatedCloseDate !== undefined) updateData.estimatedCloseDate = body.estimatedCloseDate;
    if (body.nextFollowUpAt !== undefined) updateData.nextFollowUpAt = body.nextFollowUpAt;
    if (body.followUpNote !== undefined) updateData.followUpNote = body.followUpNote;
    if (body.lostReason !== undefined) updateData.lostReason = body.lostReason;

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
