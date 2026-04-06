import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

const pipelineCreateSchema = z.object({
  businessId: z.string().uuid(),
  stage: z.enum(['new', 'contacted', 'quote_sent', 'meeting', 'won', 'ignored']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  dealValue: z.number().min(0).optional(),
});

export async function GET() {
  try {
    const data = await db
      .select({
        pipeline: schema.leadPipeline,
        business: schema.businesses,
        score: schema.leadScores,
      })
      .from(schema.leadPipeline)
      .innerJoin(schema.businesses, eq(schema.leadPipeline.businessId, schema.businesses.id))
      .leftJoin(schema.leadScores, eq(schema.businesses.id, schema.leadScores.businessId))
      .where(eq(schema.businesses.optOut, false))
      .orderBy(desc(schema.leadScores.totalScore));

    return NextResponse.json(data);
  } catch (error) {
    console.error('Pipeline error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = pipelineCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }
    const [entry] = await db
      .insert(schema.leadPipeline)
      .values({
        businessId: parsed.data.businessId,
        stage: parsed.data.stage ?? 'new',
        priority: parsed.data.priority ?? 'medium',
        dealValue: parsed.data.dealValue,
      })
      .returning();
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('Create pipeline error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
