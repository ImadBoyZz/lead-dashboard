import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

export type SystemSettingsKey =
  | 'send_enabled'
  | 'paused_until'
  | 'daily_budget_eur'
  | 'warmup_start_date'
  | 'warmup_max_override';

type DefaultValue<K extends SystemSettingsKey> = K extends 'send_enabled'
  ? boolean
  : K extends 'paused_until'
    ? string | null
    : K extends 'daily_budget_eur'
      ? number
      : K extends 'warmup_start_date'
        ? string | null
        : K extends 'warmup_max_override'
          ? number | null
          : never;

const DEFAULTS: { [K in SystemSettingsKey]: DefaultValue<K> } = {
  send_enabled: true,
  paused_until: null,
  daily_budget_eur: 15,
  warmup_start_date: null,
  warmup_max_override: null,
};

export async function getSetting<K extends SystemSettingsKey>(
  key: K,
): Promise<DefaultValue<K>> {
  const rows = await db
    .select({ value: schema.systemSettings.value })
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, key))
    .limit(1);

  if (rows.length === 0) return DEFAULTS[key];
  return rows[0].value as DefaultValue<K>;
}

export async function setSetting<K extends SystemSettingsKey>(
  key: K,
  value: DefaultValue<K>,
  updatedBy?: string,
): Promise<void> {
  const now = new Date();
  await db
    .insert(schema.systemSettings)
    .values({ key, value: value as unknown as object, updatedAt: now, updatedBy })
    .onConflictDoUpdate({
      target: schema.systemSettings.key,
      set: { value: value as unknown as object, updatedAt: now, updatedBy },
    });
}

export async function isSendingPaused(): Promise<{ paused: boolean; reason?: string }> {
  const [enabled, pausedUntilRaw] = await Promise.all([
    getSetting('send_enabled'),
    getSetting('paused_until'),
  ]);
  if (!enabled) return { paused: true, reason: 'send_enabled=false' };
  if (pausedUntilRaw) {
    const pausedUntil = new Date(pausedUntilRaw);
    if (pausedUntil.getTime() > Date.now()) {
      return { paused: true, reason: `paused_until=${pausedUntilRaw}` };
    }
  }
  return { paused: false };
}
