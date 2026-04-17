import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getSetting,
  setSetting,
  type SystemSettingsKey,
} from '@/lib/settings/system-settings';
import { getWarmupStatus } from '@/lib/deliverability/warmup';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [sendEnabled, pausedUntil, dailyBudgetEur, warmupStatus] = await Promise.all([
    getSetting('send_enabled'),
    getSetting('paused_until'),
    getSetting('daily_budget_eur'),
    getWarmupStatus(),
  ]);

  return NextResponse.json({
    sendEnabled,
    pausedUntil,
    dailyBudgetEur,
    warmup: warmupStatus,
  });
}

const updateSchema = z.object({
  sendEnabled: z.boolean().optional(),
  pausedUntil: z.string().datetime().nullable().optional(),
  dailyBudgetEur: z.number().min(0).max(500).optional(),
  warmupStartDate: z.string().date().nullable().optional(),
  warmupMaxOverride: z.number().int().min(0).max(2000).nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates: Array<[SystemSettingsKey, unknown]> = [];
  if (parsed.data.sendEnabled !== undefined) updates.push(['send_enabled', parsed.data.sendEnabled]);
  if (parsed.data.pausedUntil !== undefined) updates.push(['paused_until', parsed.data.pausedUntil]);
  if (parsed.data.dailyBudgetEur !== undefined) updates.push(['daily_budget_eur', parsed.data.dailyBudgetEur]);
  if (parsed.data.warmupStartDate !== undefined) updates.push(['warmup_start_date', parsed.data.warmupStartDate]);
  if (parsed.data.warmupMaxOverride !== undefined) updates.push(['warmup_max_override', parsed.data.warmupMaxOverride]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [key, value] of updates) await setSetting(key as any, value as any, 'admin');

  return NextResponse.json({ ok: true, updated: updates.length });
}
