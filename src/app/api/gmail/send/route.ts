import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { sendGmail } from '@/lib/gmail';

const sendSchema = z.object({
  businessId: z.string().uuid(),
  to: z.string().email(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(5000),
  draftId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  if (!(await isValidSession(request))) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }

  const { allowed } = rateLimit('gmail-send', 20, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit bereikt' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validatie mislukt', details: parsed.error.flatten() }, { status: 400 });
    }

    const { businessId, to, subject, body: emailBody, draftId } = parsed.data;

    // Verstuur via Gmail API
    const { messageId, threadId } = await sendGmail({ to, subject, body: emailBody });

    // Log in outreach_log
    await db.insert(schema.outreachLog).values({
      businessId,
      channel: 'email',
      subject,
      content: emailBody,
      outcome: 'verstuurd via Gmail',
      aiGenerated: !!draftId,
      draftId: draftId ?? null,
      gmailThreadId: threadId,
    });

    // Update pipeline
    await db
      .update(schema.leadPipeline)
      .set({
        lastOutreachAt: new Date(),
        outreachCount: sql`${schema.leadPipeline.outreachCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.leadPipeline.businessId, businessId));

    // Als het een draft was, markeer als verstuurd
    if (draftId) {
      await db
        .update(schema.outreachDrafts)
        .set({ status: 'sent', updatedAt: new Date() })
        .where(eq(schema.outreachDrafts.id, draftId));
    }

    return NextResponse.json({ success: true, messageId });
  } catch (error) {
    console.error('Gmail send error:', error);
    return NextResponse.json({ error: 'E-mail versturen mislukt' }, { status: 500 });
  }
}
