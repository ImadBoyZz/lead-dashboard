import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidSession } from '@/lib/auth';
import { autoTransitionOnOutreach } from '@/lib/pipeline-logic';
import { createAutoReminder } from '@/lib/auto-reminders';
import { sendGmail } from '@/lib/gmail';
import { env } from '@/lib/env';

const bulkApproveSchema = z.object({
  draftIds: z.array(z.string().uuid()).min(1),
});

export async function POST(request: NextRequest) {
  if (!(await isValidSession(request))) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = bulkApproveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validatie mislukt', details: parsed.error.flatten() }, { status: 400 });
    }

    // Fetch approved drafts
    const drafts = await db
      .select()
      .from(schema.outreachDrafts)
      .where(inArray(schema.outreachDrafts.id, parsed.data.draftIds));

    const approvedDrafts = drafts.filter((d) => d.status === 'approved');
    let count = 0;
    let gmailSent = 0;
    const gmailConfigured = !!(env.GMAIL_CLIENT_ID && env.GMAIL_REFRESH_TOKEN);

    for (const draft of approvedDrafts) {
      // Verstuur via Gmail als geconfigureerd en het een email is
      if (gmailConfigured && draft.channel === 'email') {
        const business = await db.query.businesses.findFirst({
          where: eq(schema.businesses.id, draft.businessId),
        });
        if (business?.email) {
          try {
            await sendGmail({
              to: business.email,
              subject: draft.subject ?? `Bericht van Averis Solutions`,
              body: draft.body,
            });
            gmailSent++;
          } catch (err) {
            console.error(`Gmail send error voor ${business.name}:`, err);
          }
        }
      }

      // Insert outreach log
      await db.insert(schema.outreachLog).values({
        businessId: draft.businessId,
        channel: draft.channel,
        subject: draft.subject,
        content: draft.body,
        outcome: gmailConfigured ? 'verstuurd via Gmail' : null,
        aiGenerated: true,
        draftId: draft.id,
      });

      // Update pipeline
      await db
        .update(schema.leadPipeline)
        .set({
          lastOutreachAt: new Date(),
          outreachCount: sql`${schema.leadPipeline.outreachCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(schema.leadPipeline.businessId, draft.businessId));

      // Auto-transition en reminder
      await autoTransitionOnOutreach(draft.businessId, draft.channel);
      await createAutoReminder(draft.businessId, draft.channel);

      // Update draft status naar 'sent'
      await db
        .update(schema.outreachDrafts)
        .set({ status: 'sent', updatedAt: new Date() })
        .where(eq(schema.outreachDrafts.id, draft.id));

      count++;
    }

    return NextResponse.json({ count, gmailSent });
  } catch (error) {
    console.error('Bulk approve error:', error);
    return NextResponse.json({ error: 'Interne serverfout' }, { status: 500 });
  }
}
