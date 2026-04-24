// Rolling 7d deliverability monitor. n8n draait dit elke 30 min.
// Als bounce% > 2% (min 3 bounces) OF complaint% > 0.1% (min 1 complaint) over
// de laatste 7 dagen — en er zijn minstens 20 delivered mails — flippen we
// `send_enabled` uit en sturen een Telegram alert.
//
// Min-volume floor (20 delivered) voorkomt false positives in warmup fase:
// 1 bounce op 5 sends = 20% en zou direct het domein stilleggen.

import { NextRequest, NextResponse } from 'next/server';
import { sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { authenticateN8n } from '@/lib/webhook-auth';
import { getSetting, setSetting } from '@/lib/settings/system-settings';
import { sendTelegramAlert } from '@/lib/notify/telegram';

export const maxDuration = 30;

const BOUNCE_PCT_THRESHOLD = 2.0;
const BOUNCE_MIN_COUNT = 3;
const COMPLAINT_PCT_THRESHOLD = 0.1;
const COMPLAINT_MIN_COUNT = 1;
const MIN_VOLUME_FLOOR = 20;
const ROLLING_WINDOW_DAYS = 7;

interface CheckResult {
  delivered: number;
  bounces: number;
  complaints: number;
  bouncePct: number;
  complaintPct: number;
  triggered: boolean;
  reason: string | null;
  alreadyPaused: boolean;
  alertSent: boolean;
  minVolumeMet: boolean;
}

export async function GET(req: NextRequest) {
  if (!authenticateN8n(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  const runDate = today.toISOString().slice(0, 10);

  // Start batch_runs record voor observability
  const [runRow] = await db
    .insert(schema.batchRuns)
    .values({
      jobType: 'deliverability-check',
      runDate,
      status: 'running',
      metadata: {
        bouncePctThreshold: BOUNCE_PCT_THRESHOLD,
        complaintPctThreshold: COMPLAINT_PCT_THRESHOLD,
        minVolumeFloor: MIN_VOLUME_FLOOR,
        windowDays: ROLLING_WINDOW_DAYS,
      },
    })
    .returning({ id: schema.batchRuns.id });

  try {
    const queryResult = await db.execute<{
      delivered: string | number;
      bounces: string | number;
      complaints: string | number;
    }>(dsql`
      SELECT
        COUNT(*) FILTER (WHERE delivery_status IS NOT NULL) AS delivered,
        COUNT(*) FILTER (WHERE delivery_status IN ('hard_bounced', 'soft_bounced')) AS bounces,
        COUNT(*) FILTER (WHERE delivery_status = 'complained') AS complaints
      FROM outreach_log
      WHERE contacted_at >= NOW() - (${ROLLING_WINDOW_DAYS} * INTERVAL '1 day')
    `);

    const rows = (queryResult as { rows?: unknown[] }).rows ?? (queryResult as unknown as unknown[]);
    const counts = (Array.isArray(rows) ? rows[0] : null) as
      | { delivered: string | number; bounces: string | number; complaints: string | number }
      | null;

    const delivered = Number(counts?.delivered ?? 0);
    const bounces = Number(counts?.bounces ?? 0);
    const complaints = Number(counts?.complaints ?? 0);

    const bouncePct = delivered > 0 ? (bounces / delivered) * 100 : 0;
    const complaintPct = delivered > 0 ? (complaints / delivered) * 100 : 0;
    const minVolumeMet = delivered >= MIN_VOLUME_FLOOR;

    let triggered = false;
    let reason: string | null = null;

    if (minVolumeMet) {
      if (bouncePct > BOUNCE_PCT_THRESHOLD && bounces >= BOUNCE_MIN_COUNT) {
        triggered = true;
        reason = `bounce_rate ${bouncePct.toFixed(2)}% > ${BOUNCE_PCT_THRESHOLD}% (${bounces} bounces / ${delivered} delivered, 7d)`;
      } else if (complaintPct > COMPLAINT_PCT_THRESHOLD && complaints >= COMPLAINT_MIN_COUNT) {
        triggered = true;
        reason = `complaint_rate ${complaintPct.toFixed(3)}% > ${COMPLAINT_PCT_THRESHOLD}% (${complaints} complaints / ${delivered} delivered, 7d)`;
      }
    }

    const currentlyEnabled = await getSetting('send_enabled');
    const alreadyPaused = !currentlyEnabled;
    let alertSent = false;

    if (triggered && currentlyEnabled) {
      await setSetting('send_enabled', false, 'deliverability-monitor');
      const alert = await sendTelegramAlert(
        'Send auto-pause: deliverability drempel overschreden',
        [
          `Reden: ${reason}`,
          ``,
          `Delivered: ${delivered}`,
          `Bounces: ${bounces} (${bouncePct.toFixed(2)}%)`,
          `Complaints: ${complaints} (${complaintPct.toFixed(3)}%)`,
          `Venster: laatste ${ROLLING_WINDOW_DAYS} dagen`,
          ``,
          `send_enabled is automatisch op false gezet.`,
          `Review: /review en /settings`,
        ].join('\n'),
      );
      alertSent = alert.sent;
    }

    const result: CheckResult = {
      delivered,
      bounces,
      complaints,
      bouncePct: Number(bouncePct.toFixed(3)),
      complaintPct: Number(complaintPct.toFixed(4)),
      triggered,
      reason,
      alreadyPaused,
      alertSent,
      minVolumeMet,
    };

    await db
      .update(schema.batchRuns)
      .set({
        finishedAt: new Date(),
        status: 'ok',
        inputCount: delivered,
        outputCount: triggered ? 1 : 0,
        skippedReasons: minVolumeMet ? null : { min_volume_not_met: MIN_VOLUME_FLOOR - delivered },
        metadata: {
          ...result,
          bouncePctThreshold: BOUNCE_PCT_THRESHOLD,
          complaintPctThreshold: COMPLAINT_PCT_THRESHOLD,
          minVolumeFloor: MIN_VOLUME_FLOOR,
          windowDays: ROLLING_WINDOW_DAYS,
        },
      })
      .where(dsql`${schema.batchRuns.id} = ${runRow.id}`);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.batchRuns)
      .set({
        finishedAt: new Date(),
        status: 'error',
        errorMessage: message,
      })
      .where(dsql`${schema.batchRuns.id} = ${runRow.id}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
