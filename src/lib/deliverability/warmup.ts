import { getSetting } from '@/lib/settings/system-settings';

/**
 * Warmup ramp voor cold outreach reputatie-opbouw.
 * Week 0 = 5/dag (pre-warmup), week 1 = 10/dag, week 2 = 25/dag, week 3 = 50/dag, daarna 100/dag.
 * Als er geen warmup_start_date gezet is, wordt er conservatief 5/dag aangehouden.
 */
const WARMUP_STAGES: Array<{ untilDay: number; max: number }> = [
  { untilDay: 7, max: 5 },
  { untilDay: 14, max: 10 },
  { untilDay: 21, max: 25 },
  { untilDay: 28, max: 50 },
  { untilDay: Infinity, max: 100 },
];

function daysBetween(fromISO: string, to: Date): number {
  const from = new Date(fromISO);
  const diffMs = to.getTime() - from.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export async function getMaxSendsToday(now: Date = new Date()): Promise<number> {
  const [override, startDate] = await Promise.all([
    getSetting('warmup_max_override'),
    getSetting('warmup_start_date'),
  ]);

  if (override != null) return override;
  if (!startDate) return WARMUP_STAGES[0].max;

  const day = daysBetween(startDate, now);
  const stage = WARMUP_STAGES.find((s) => day < s.untilDay) ?? WARMUP_STAGES[WARMUP_STAGES.length - 1];
  return stage.max;
}

export async function getWarmupStatus(now: Date = new Date()): Promise<{
  startDate: string | null;
  currentDay: number | null;
  maxSendsToday: number;
  stage: string;
  overridden: boolean;
}> {
  const [override, startDate] = await Promise.all([
    getSetting('warmup_max_override'),
    getSetting('warmup_start_date'),
  ]);

  const maxSendsToday = await getMaxSendsToday(now);

  if (override != null) {
    return {
      startDate,
      currentDay: startDate ? daysBetween(startDate, now) : null,
      maxSendsToday,
      stage: 'override',
      overridden: true,
    };
  }

  if (!startDate) {
    return {
      startDate: null,
      currentDay: null,
      maxSendsToday,
      stage: 'not_started',
      overridden: false,
    };
  }

  const day = daysBetween(startDate, now);
  const stageLabel =
    day < 7 ? 'week_0'
    : day < 14 ? 'week_1'
    : day < 21 ? 'week_2'
    : day < 28 ? 'week_3'
    : 'full_capacity';

  return {
    startDate,
    currentDay: day,
    maxSendsToday,
    stage: stageLabel,
    overridden: false,
  };
}
