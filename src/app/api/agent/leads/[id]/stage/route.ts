import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidAgentToken } from '@/lib/agent-auth';
import { rateLimit } from '@/lib/rate-limit';

export const maxDuration = 15;

const stageSchema = z.object({
  newStage: z.enum(['new', 'contacted', 'quote_sent', 'meeting', 'won', 'ignored']),
  note: z.string().max(1000),
  reasoning: z.string().max(2000),
  modelVersion: z.string().max(100),
  latencyMs: z.number().int().optional(),
  inputSnapshot: z.record(z.string(), z.unknown()).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // Auth
  if (!isValidAgentToken(request)) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }

  // Rate limit: 20 calls/min
  const { allowed } = rateLimit('agent-stage', 20, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit bereikt' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = stageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validatie mislukt', details: parsed.error.flatten() }, { status: 400 });
    }

    const { newStage, note, reasoning, modelVersion, latencyMs, inputSnapshot } = parsed.data;

    // Agent mag NIET naar 'won' zetten
    if (newStage === 'won') {
      return NextResponse.json({ error: 'Agent mag stage niet naar "won" zetten — alleen menselijk' }, { status: 403 });
    }

    // Huidige pipeline ophalen
    const pipeline = await db.query.leadPipeline.findFirst({
      where: eq(schema.leadPipeline.businessId, id),
    });

    if (!pipeline) {
      return NextResponse.json({ error: 'Lead pipeline niet gevonden' }, { status: 404 });
    }

    const previousStage = pipeline.stage;

    // Pipeline stage updaten
    await db
      .update(schema.leadPipeline)
      .set({
        stage: newStage,
        stageChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.leadPipeline.businessId, id));

    // Agent action loggen
    await db.insert(schema.agentActions).values({
      businessId: id,
      decision: 'stage_change',
      previousStage,
      newStage,
      note,
      reasoning,
      modelVersion,
      latencyMs: latencyMs ?? null,
      inputSnapshot: inputSnapshot ?? null,
    });

    // Notitie toevoegen
    await db.insert(schema.notes).values({
      businessId: id,
      content: note,
      author: 'agent',
    });

    // Status history
    await db.insert(schema.statusHistory).values({
      businessId: id,
      fromStatus: previousStage,
      toStatus: newStage,
    });

    return NextResponse.json({ success: true, previousStage, newStage });
  } catch (error) {
    console.error('Agent stage error:', error);
    return NextResponse.json({ error: 'Interne serverfout' }, { status: 500 });
  }
}
