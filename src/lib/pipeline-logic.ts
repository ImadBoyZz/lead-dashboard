import { eq, and, or, notInArray, count, sql, lte } from 'drizzle-orm';
import { db } from './db';
import * as schema from './db/schema';

type PipelineStage = 'new' | 'contacted' | 'quote_sent' | 'meeting' | 'won' | 'ignored';
type RejectionReason = 'no_budget' | 'no_interest' | 'has_supplier' | 'bad_timing' | 'no_response' | 'other';

const MAX_ACTIVE_LEADS = 15;
const CLOSED_STAGES: PipelineStage[] = ['won', 'ignored'];

const STAGE_TO_STATUS: Record<string, string> = {
  new: 'new',
  contacted: 'contacted',
  quote_sent: 'quote_sent',
  meeting: 'meeting',
  won: 'won',
  ignored: 'lost',
};

export async function updatePipelineStage(
  businessId: string,
  newStage: PipelineStage,
  oldStage?: string,
) {
  // Update pipeline
  await db
    .update(schema.leadPipeline)
    .set({
      stage: newStage,
      stageChangedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.leadPipeline.businessId, businessId));

  // Sync to leadStatuses
  const mappedStatus = STAGE_TO_STATUS[newStage] ?? 'new';
  const updateData: Record<string, unknown> = {
    status: mappedStatus,
    statusChangedAt: new Date(),
  };

  if (newStage === 'contacted') {
    updateData.contactedAt = new Date();
  } else if (newStage === 'meeting') {
    updateData.meetingAt = new Date();
  } else if (newStage === 'won' || newStage === 'ignored') {
    updateData.closedAt = new Date();
  }

  await db
    .update(schema.leadStatuses)
    .set(updateData)
    .where(eq(schema.leadStatuses.businessId, businessId));

  // Write to status history
  if (oldStage && oldStage !== newStage) {
    await db.insert(schema.statusHistory).values({
      businessId,
      fromStatus: oldStage,
      toStatus: newStage,
    });
  }
}

export async function autoTransitionOnOutreach(
  businessId: string,
  channel: string,
): Promise<PipelineStage | null> {
  const [pipeline] = await db
    .select()
    .from(schema.leadPipeline)
    .where(eq(schema.leadPipeline.businessId, businessId))
    .limit(1);

  if (!pipeline) return null;

  if (pipeline.stage === 'new') {
    await updatePipelineStage(businessId, 'contacted', 'new');
    return 'contacted';
  }

  return null;
}

// ── Urgentie: "Actie vereist vandaag" ────────────────

export type UrgentLead = {
  businessId: string;
  businessName: string;
  city: string | null;
  stage: string;
  priority: string;
  urgencyType: 'follow_up' | 'reminder';
  dueDate: Date;
  detail: string | null;
};

export async function getUrgentLeadsToday(): Promise<UrgentLead[]> {
  const now = new Date();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  // Leads met vervallen of vandaag due follow-ups
  const followUps = await db
    .select({
      businessId: schema.businesses.id,
      businessName: schema.businesses.name,
      city: schema.businesses.city,
      stage: schema.leadPipeline.stage,
      priority: schema.leadPipeline.priority,
      dueDate: schema.leadPipeline.nextFollowUpAt,
      detail: schema.leadPipeline.followUpNote,
    })
    .from(schema.leadPipeline)
    .innerJoin(schema.businesses, eq(schema.leadPipeline.businessId, schema.businesses.id))
    .where(
      and(
        lte(schema.leadPipeline.nextFollowUpAt, endOfDay),
        eq(schema.leadPipeline.frozen, false),
        notInArray(schema.leadPipeline.stage, CLOSED_STAGES),
      ),
    )
    .limit(10);

  // Reminders die vandaag due zijn
  const remindersDue = await db
    .select({
      businessId: schema.businesses.id,
      businessName: schema.businesses.name,
      city: schema.businesses.city,
      stage: schema.leadPipeline.stage,
      priority: schema.leadPipeline.priority,
      dueDate: schema.reminders.dueDate,
      detail: schema.reminders.title,
    })
    .from(schema.reminders)
    .innerJoin(schema.businesses, eq(schema.reminders.businessId, schema.businesses.id))
    .innerJoin(schema.leadPipeline, eq(schema.leadPipeline.businessId, schema.businesses.id))
    .where(
      and(
        eq(schema.reminders.status, 'pending'),
        lte(schema.reminders.dueDate, endOfDay),
      ),
    )
    .limit(10);

  const results: UrgentLead[] = [
    ...followUps
      .filter((f) => f.dueDate !== null)
      .map((f) => ({
        businessId: f.businessId,
        businessName: f.businessName,
        city: f.city,
        stage: f.stage,
        priority: f.priority,
        urgencyType: 'follow_up' as const,
        dueDate: f.dueDate!,
        detail: f.detail,
      })),
    ...remindersDue.map((r) => ({
      businessId: r.businessId,
      businessName: r.businessName,
      city: r.city,
      stage: r.stage,
      priority: r.priority,
      urgencyType: 'reminder' as const,
      dueDate: r.dueDate,
      detail: r.detail,
    })),
  ];

  // Deduplicate by businessId, keep earliest due
  const seen = new Map<string, UrgentLead>();
  for (const item of results.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())) {
    if (!seen.has(item.businessId)) {
      seen.set(item.businessId, item);
    }
  }

  return Array.from(seen.values()).slice(0, 5);
}

// ── Fase 3: Prioriteitswachtrij ──────────────────────

/**
 * Aantal actieve (niet-bevroren, niet-gesloten) leads in de pipeline.
 */
export async function getActiveLeadCount(): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(schema.leadPipeline)
    .where(
      and(
        eq(schema.leadPipeline.frozen, false),
        notInArray(schema.leadPipeline.stage, CLOSED_STAGES),
      ),
    );
  return result.count;
}

/**
 * Check of er ruimte is in de actieve wachtrij.
 */
export async function hasQueueCapacity(): Promise<{ hasCapacity: boolean; activeCount: number; max: number }> {
  const activeCount = await getActiveLeadCount();
  return { hasCapacity: activeCount < MAX_ACTIVE_LEADS, activeCount, max: MAX_ACTIVE_LEADS };
}

/**
 * Bevries een lead (parkeer buiten actieve wachtrij).
 */
export async function freezeLead(businessId: string): Promise<void> {
  await db
    .update(schema.leadPipeline)
    .set({ frozen: true, frozenAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.leadPipeline.businessId, businessId));
}

/**
 * Ontdooi een lead (breng terug in actieve wachtrij), mits capaciteit.
 */
export async function unfreezeLead(businessId: string): Promise<boolean> {
  const { hasCapacity } = await hasQueueCapacity();
  if (!hasCapacity) return false;

  await db
    .update(schema.leadPipeline)
    .set({ frozen: false, frozenAt: null, updatedAt: new Date() })
    .where(eq(schema.leadPipeline.businessId, businessId));
  return true;
}

// ── Fase 3: Rejection tracking ──────────────────────

/**
 * Markeer een lead als genegeerd met gestructureerde reden.
 */
export async function markAsIgnored(
  businessId: string,
  rejectionReason: RejectionReason,
  lostReasonDetail?: string,
): Promise<void> {
  const [pipeline] = await db
    .select()
    .from(schema.leadPipeline)
    .where(eq(schema.leadPipeline.businessId, businessId))
    .limit(1);

  await updatePipelineStage(businessId, 'ignored', pipeline?.stage);

  await db
    .update(schema.leadPipeline)
    .set({
      rejectionReason,
      lostReason: lostReasonDetail ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.leadPipeline.businessId, businessId));
}

/**
 * Markeer een lead als gewonnen met deal waarde.
 */
export async function markAsWon(
  businessId: string,
  wonValue: number,
): Promise<void> {
  const [pipeline] = await db
    .select()
    .from(schema.leadPipeline)
    .where(eq(schema.leadPipeline.businessId, businessId))
    .limit(1);

  await updatePipelineStage(businessId, 'won', pipeline?.stage);

  await db
    .update(schema.leadPipeline)
    .set({ wonValue, dealValue: wonValue, updatedAt: new Date() })
    .where(eq(schema.leadPipeline.businessId, businessId));
}
