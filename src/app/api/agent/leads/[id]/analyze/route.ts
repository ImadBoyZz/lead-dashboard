import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidAgentToken } from '@/lib/agent-auth';
import { rateLimit } from '@/lib/rate-limit';

const analyzeSchema = z.object({
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
  const { allowed } = rateLimit('agent-analyze', 20, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit bereikt' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = analyzeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validatie mislukt', details: parsed.error.flatten() }, { status: 400 });
    }

    const { note, reasoning, modelVersion, latencyMs, inputSnapshot } = parsed.data;

    // Agent action loggen
    await db.insert(schema.agentActions).values({
      businessId: id,
      decision: 'no_action',
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Agent analyze error:', error);
    return NextResponse.json({ error: 'Interne serverfout' }, { status: 500 });
  }
}
