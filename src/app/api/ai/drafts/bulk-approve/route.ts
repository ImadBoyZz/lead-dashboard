import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidSession } from '@/lib/auth';
import { autoTransitionOnOutreach } from '@/lib/pipeline-logic';
import { createAutoReminder } from '@/lib/auto-reminders';

const bulkApproveSchema = z.object({
  draftIds: z.array(z.string().uuid()).min(1),
});

export async function POST(request: NextRequest) {
  if (!isValidSession(request)) {
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

    for (const draft of approvedDrafts) {
      // Insert outreach log
      await db.insert(schema.outreachLog).values({
        businessId: draft.businessId,
        channel: draft.channel,
        subject: draft.subject,
        content: draft.body,
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

    return NextResponse.json({ count });
  } catch (error) {
    console.error('Bulk approve error:', error);
    return NextResponse.json({ error: 'Interne serverfout' }, { status: 500 });
  }
}
