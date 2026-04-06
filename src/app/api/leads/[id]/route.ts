import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

type RouteContext = { params: Promise<{ id: string }> };

// ── GET: Full lead detail ─────────────────────────────

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;

    // Fetch business with joins
    const [result] = await db
      .select({
        business: schema.businesses,
        audit: schema.auditResults,
        score: schema.leadScores,
        status: schema.leadStatuses,
      })
      .from(schema.businesses)
      .leftJoin(
        schema.auditResults,
        eq(schema.businesses.id, schema.auditResults.businessId),
      )
      .leftJoin(
        schema.leadScores,
        eq(schema.businesses.id, schema.leadScores.businessId),
      )
      .leftJoin(
        schema.leadStatuses,
        eq(schema.businesses.id, schema.leadStatuses.businessId),
      )
      .where(eq(schema.businesses.id, id))
      .limit(1);

    if (!result) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Fetch notes
    const leadNotes = await db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.businessId, id))
      .orderBy(desc(schema.notes.createdAt));

    // Fetch status history
    const history = await db
      .select()
      .from(schema.statusHistory)
      .where(eq(schema.statusHistory.businessId, id))
      .orderBy(desc(schema.statusHistory.changedAt));

    return NextResponse.json({
      ...result.business,
      audit: result.audit,
      score: result.score,
      status: result.status,
      notes: leadNotes,
      statusHistory: history,
    });
  } catch (error) {
    console.error('Lead GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ── PATCH: Update lead ────────────────────────────────

const patchSchema = z.object({
  status: z
    .enum([
      'new',
      'contacted',
      'quote_sent',
      'meeting',
      'won',
      'ignored',
    ])
    .optional(),
  meetingAt: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  website: z.string().max(500).optional().or(z.literal('')),
  facebook: z.string().max(500).optional().or(z.literal('')),
  note: z.string().optional(),
  optOut: z.boolean().optional(),
  leadTemperature: z.enum(['cold', 'warm']).optional(),
  blacklisted: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { status, meetingAt, email, phone, website, facebook, note, optOut, leadTemperature, blacklisted } = parsed.data;

    // Verify business exists
    const [business] = await db
      .select({ id: schema.businesses.id })
      .from(schema.businesses)
      .where(eq(schema.businesses.id, id))
      .limit(1);

    if (!business) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Handle status change
    if (status) {
      // Get current status
      const [currentStatus] = await db
        .select({ status: schema.leadStatuses.status })
        .from(schema.leadStatuses)
        .where(eq(schema.leadStatuses.businessId, id))
        .limit(1);

      const fromStatus = currentStatus?.status ?? null;

      // Build update fields
      const statusUpdate: Record<string, unknown> = {
        status,
        statusChangedAt: new Date(),
      };

      if (status === 'contacted') statusUpdate.contactedAt = new Date();
      if (status === 'meeting') statusUpdate.meetingAt = new Date();
      if (status === 'won' || status === 'ignored') statusUpdate.closedAt = new Date();

      await db
        .update(schema.leadStatuses)
        .set(statusUpdate)
        .where(eq(schema.leadStatuses.businessId, id));

      // Insert status history
      await db.insert(schema.statusHistory).values({
        businessId: id,
        fromStatus,
        toStatus: status,
      });

      // Sync pipeline stage
      const [pipeline] = await db
        .select({ id: schema.leadPipeline.id })
        .from(schema.leadPipeline)
        .where(eq(schema.leadPipeline.businessId, id))
        .limit(1);

      if (pipeline) {
        await db
          .update(schema.leadPipeline)
          .set({
            stage: status as 'new' | 'contacted' | 'quote_sent' | 'meeting' | 'won' | 'ignored',
            stageChangedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.leadPipeline.businessId, id));
      }
    }

    // Handle contact info updates
    if (email !== undefined || phone !== undefined || website !== undefined || facebook !== undefined) {
      const contactUpdate: Record<string, unknown> = { updatedAt: new Date() };
      if (email !== undefined) contactUpdate.email = email || null;
      if (phone !== undefined) contactUpdate.phone = phone || null;
      if (website !== undefined) contactUpdate.website = website || null;
      if (facebook !== undefined) contactUpdate.facebook = facebook || null;

      await db
        .update(schema.businesses)
        .set(contactUpdate)
        .where(eq(schema.businesses.id, id));
    }

    // Handle meetingAt update
    if (meetingAt !== undefined) {
      await db
        .update(schema.leadStatuses)
        .set({ meetingAt: meetingAt ? new Date(meetingAt) : null })
        .where(eq(schema.leadStatuses.businessId, id));
    }

    // Handle note
    if (note) {
      await db.insert(schema.notes).values({
        businessId: id,
        content: note,
      });
    }

    // Handle opt-out
    if (optOut !== undefined) {
      await db
        .update(schema.businesses)
        .set({
          optOut,
          optOutAt: optOut ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.businesses.id, id));
    }

    // Handle temperature change (cold → warm)
    if (leadTemperature) {
      await db
        .update(schema.businesses)
        .set({ leadTemperature, updatedAt: new Date() })
        .where(eq(schema.businesses.id, id));
    }

    // Handle blacklist
    if (blacklisted !== undefined) {
      await db
        .update(schema.businesses)
        .set({
          blacklisted,
          blacklistedAt: blacklisted ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.businesses.id, id));
    }

    // Return updated lead
    const [updated] = await db
      .select({
        business: schema.businesses,
        audit: schema.auditResults,
        score: schema.leadScores,
        leadStatus: schema.leadStatuses,
      })
      .from(schema.businesses)
      .leftJoin(
        schema.auditResults,
        eq(schema.businesses.id, schema.auditResults.businessId),
      )
      .leftJoin(
        schema.leadScores,
        eq(schema.businesses.id, schema.leadScores.businessId),
      )
      .leftJoin(
        schema.leadStatuses,
        eq(schema.businesses.id, schema.leadStatuses.businessId),
      )
      .where(eq(schema.businesses.id, id))
      .limit(1);

    const leadNotes = await db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.businessId, id))
      .orderBy(desc(schema.notes.createdAt));

    const history = await db
      .select()
      .from(schema.statusHistory)
      .where(eq(schema.statusHistory.businessId, id))
      .orderBy(desc(schema.statusHistory.changedAt));

    return NextResponse.json({
      ...updated.business,
      audit: updated.audit,
      score: updated.score,
      status: updated.leadStatus,
      notes: leadNotes,
      statusHistory: history,
    });
  } catch (error) {
    console.error('Lead PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
