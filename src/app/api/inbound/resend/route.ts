import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { Webhook } from 'svix';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { env } from '@/lib/env';

type ResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.bounced'
  | 'email.complained'
  | 'email.opened'
  | 'email.clicked';

type ResendEvent = {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    tags?: Record<string, string>;
    bounce?: { type?: 'hard' | 'soft'; message?: string };
  };
};

function verifySignature(raw: string, headers: Headers): ResendEvent | null {
  if (!env.RESEND_WEBHOOK_SECRET) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET ontbreekt');
    return null;
  }
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signature = headers.get('svix-signature');
  if (!id || !timestamp || !signature) return null;
  try {
    const wh = new Webhook(env.RESEND_WEBHOOK_SECRET);
    return wh.verify(raw, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    }) as ResendEvent;
  } catch (err) {
    console.error('[resend-webhook] signature verify mislukt', err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const event = verifySignature(raw, req.headers);
  if (!event) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const messageId = event.data.email_id;
  if (!messageId) {
    return NextResponse.json({ ok: true, note: 'no message id' });
  }

  const logs = await db
    .select()
    .from(schema.outreachLog)
    .where(eq(schema.outreachLog.resendMessageId, messageId))
    .limit(1);
  const log = logs[0];

  const now = new Date();

  switch (event.type) {
    case 'email.delivered':
      if (log) {
        await db
          .update(schema.outreachLog)
          .set({ deliveryStatus: 'delivered', deliveredAt: now })
          .where(eq(schema.outreachLog.id, log.id));
      }
      break;

    case 'email.bounced': {
      const bounceType = event.data.bounce?.type === 'hard' ? 'hard_bounced' : 'soft_bounced';
      if (log) {
        await db
          .update(schema.outreachLog)
          .set({
            deliveryStatus: bounceType,
            bouncedAt: now,
          })
          .where(eq(schema.outreachLog.id, log.id));
        await db
          .update(schema.businesses)
          .set({
            emailStatus: bounceType === 'hard_bounced' ? 'hard_bounced' : 'soft_bounced',
            emailStatusUpdatedAt: now,
            updatedAt: now,
          })
          .where(eq(schema.businesses.id, log.businessId));
      }
      break;
    }

    case 'email.complained':
      if (log) {
        await db
          .update(schema.outreachLog)
          .set({ deliveryStatus: 'complained', complainedAt: now })
          .where(eq(schema.outreachLog.id, log.id));
        await db
          .update(schema.businesses)
          .set({
            emailStatus: 'complained',
            emailStatusUpdatedAt: now,
            optOut: true,
            optOutAt: now,
            optOutReason: 'spam_complaint',
            updatedAt: now,
          })
          .where(eq(schema.businesses.id, log.businessId));
      }
      break;

    case 'email.sent':
    case 'email.delivery_delayed':
    case 'email.opened':
    case 'email.clicked':
      // Nog geen actie; later te tracken in aparte kolommen.
      break;
  }

  return NextResponse.json({ ok: true });
}
