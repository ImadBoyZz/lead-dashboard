// Send Worker endpoint voor n8n. Elke cron-tick (elke 5 min Mon-Fri 09-17):
//   1. Check sendEnabled + paused_until + warmup cap
//   2. Conditional UPDATE pak oudste approved draft → status='sending' (race-safe)
//   3. Verstuur via Resend (sendOutreachEmail)
//   4. Op succes: status='sent' + outreachLog entry
//   5. Op faal: status='send_failed'
//
// Neon HTTP heeft geen transacties, daarom single-statement conditional UPDATE
// met WHERE clause + RETURNING voor atomiciteit. Zie plan §Neon HTTP =
// geen transacties.

import { NextRequest, NextResponse } from 'next/server';
import { eq, sql as dsql, gte, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { authenticateN8n, authenticateSessionOrBearer } from '@/lib/webhook-auth';
import { isSendingPaused } from '@/lib/settings/system-settings';
import { getMaxSendsToday } from '@/lib/deliverability/warmup';
import { sendOutreachEmail } from '@/lib/email/send';
import { generateUnsubscribeToken } from '@/lib/unsubscribe';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Alleen n8n Bearer OF ingelogde user (handmatige test)
  if (!authenticateN8n(req) && !(await authenticateSessionOrBearer(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Kill-switch + pauze check
  const pauseState = await isSendingPaused();
  if (pauseState.paused) {
    return NextResponse.json(
      { sent: false, skipped: true, reason: pauseState.reason ?? 'send disabled' },
      { status: 200 },
    );
  }

  // 2. Warmup cap: hoeveel zijn er vandaag al verstuurd?
  const maxToday = await getMaxSendsToday();
  const sentToday = await countSentToday();
  if (sentToday >= maxToday) {
    return NextResponse.json(
      {
        sent: false,
        skipped: true,
        reason: `warmup_cap_reached (${sentToday}/${maxToday})`,
        sentToday,
        maxToday,
      },
      { status: 200 },
    );
  }

  // 3. Race-safe claim: update oudste approved → sending, RETURNING row
  // Single-statement UPDATE met nested subselect. Bij parallelle callers
  // slaagt maar 1 claim (de andere ziet 0 affected rows).
  const claimed = await db.execute<{
    id: string;
    business_id: string;
    channel: string;
    subject: string | null;
    body: string;
    tone: string;
    status: string;
  }>(dsql`
    UPDATE outreach_drafts
    SET status = 'sending', updated_at = NOW()
    WHERE status = 'approved'
      AND id = (
        SELECT id FROM outreach_drafts
        WHERE status = 'approved'
        ORDER BY created_at ASC
        LIMIT 1
      )
    RETURNING id, business_id, channel, subject, body, tone, status
  `);

  const rows = claimed.rows ?? claimed;
  const draft = Array.isArray(rows) ? rows[0] : null;
  if (!draft) {
    return NextResponse.json(
      { sent: false, skipped: true, reason: 'geen approved drafts in wachtrij' },
      { status: 200 },
    );
  }

  const draftId = draft.id;
  const businessId = draft.business_id;

  // Email-kanaal check: we ondersteunen alleen email-send via Resend
  if (draft.channel !== 'email') {
    await markDraft(draftId, 'rejected'); // non-email drafts niet via deze worker
    return NextResponse.json(
      { sent: false, skipped: true, reason: `channel ${draft.channel} niet ondersteund via send worker` },
      { status: 200 },
    );
  }

  // 4. Haal business + email op
  const [business] = await db
    .select({
      id: schema.businesses.id,
      email: schema.businesses.email,
      emailStatus: schema.businesses.emailStatus,
      optOut: schema.businesses.optOut,
      blacklisted: schema.businesses.blacklisted,
    })
    .from(schema.businesses)
    .where(eq(schema.businesses.id, businessId))
    .limit(1);

  if (!business) {
    await markDraft(draftId, 'send_failed');
    return NextResponse.json({ sent: false, error: 'business niet gevonden' }, { status: 500 });
  }

  // Extra safety gates vóór send
  if (business.optOut) {
    await markDraft(draftId, 'rejected');
    return NextResponse.json({ sent: false, skipped: true, reason: 'opt_out' });
  }
  if (business.blacklisted) {
    await markDraft(draftId, 'rejected');
    return NextResponse.json({ sent: false, skipped: true, reason: 'blacklisted' });
  }
  if (!business.email) {
    await markDraft(draftId, 'send_failed');
    return NextResponse.json({ sent: false, skipped: true, reason: 'geen email op lead' });
  }
  if (business.emailStatus === 'hard_bounced' || business.emailStatus === 'invalid') {
    await markDraft(draftId, 'rejected');
    return NextResponse.json({
      sent: false,
      skipped: true,
      reason: `email_status=${business.emailStatus}`,
    });
  }

  // 5. Verstuur via Resend
  let messageId: string;
  let unsubscribeUrl: string;
  try {
    const result = await sendOutreachEmail({
      to: business.email,
      subject: draft.subject ?? '(Geen onderwerp)',
      body: draft.body,
      businessId,
    });
    messageId = result.messageId;
    unsubscribeUrl = result.unsubscribeUrl;
  } catch (err) {
    console.error('[to-send] Resend fout:', err);
    await markDraft(draftId, 'send_failed');
    return NextResponse.json(
      { sent: false, error: (err as Error).message },
      { status: 502 },
    );
  }

  // 6. outreachLog entry + draft status 'sent'
  try {
    await db.insert(schema.outreachLog).values({
      businessId,
      channel: 'email',
      subject: draft.subject,
      content: draft.body,
      draftId,
      aiGenerated: true,
      resendMessageId: messageId,
      unsubscribeToken: generateUnsubscribeToken(businessId),
      deliveryStatus: 'sent',
    });
  } catch (err) {
    console.error('[to-send] outreachLog insert faalde (mail is wél verstuurd):', err);
  }

  await markDraft(draftId, 'sent');

  return NextResponse.json({
    sent: true,
    draftId,
    businessId,
    messageId,
    unsubscribeUrl,
    sentToday: sentToday + 1,
    maxToday,
  });
}

// GET: inspectie-endpoint voor n8n health check / UI widget
export async function GET(req: NextRequest) {
  if (!authenticateN8n(req) && !(await authenticateSessionOrBearer(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [pauseState, maxToday, sentToday, queue] = await Promise.all([
    isSendingPaused(),
    getMaxSendsToday(),
    countSentToday(),
    db
      .select({ count: dsql<number>`COUNT(*)::int` })
      .from(schema.outreachDrafts)
      .where(eq(schema.outreachDrafts.status, 'approved')),
  ]);

  return NextResponse.json({
    paused: pauseState.paused,
    pauseReason: pauseState.reason ?? null,
    sentToday,
    maxToday,
    remainingToday: Math.max(0, maxToday - sentToday),
    queueDepth: queue[0]?.count ?? 0,
  });
}

async function markDraft(
  draftId: string,
  status: 'sent' | 'send_failed' | 'rejected',
) {
  await db
    .update(schema.outreachDrafts)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.outreachDrafts.id, draftId));
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function countSentToday(): Promise<number> {
  const [row] = await db
    .select({ count: dsql<number>`COUNT(*)::int` })
    .from(schema.outreachLog)
    .where(
      and(
        gte(schema.outreachLog.contactedAt, startOfToday()),
        eq(schema.outreachLog.channel, 'email'),
      )!,
    );
  return row?.count ?? 0;
}
