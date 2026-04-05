import { eq, and, notInArray, count, sql } from 'drizzle-orm';
import { db } from './db';
import * as schema from './db/schema';

type PipelineStage = 'new' | 'researching' | 'contacted' | 'replied' | 'meeting_booked' | 'proposal_sent' | 'negotiating' | 'won' | 'lost' | 'not_qualified' | 'nurture';
type RejectionReason = 'no_budget' | 'no_interest' | 'has_supplier' | 'bad_timing' | 'no_response' | 'other';

const MAX_ACTIVE_LEADS = 15;
const CLOSED_STAGES: PipelineStage[] = ['won', 'lost', 'not_qualified', 'nurture'];

const STAGE_TO_STATUS: Record<string, string> = {
  new: 'new',
  researching: 'new',
  contacted: 'contacted',
  replied: 'replied',
  meeting_booked: 'meeting',
  proposal_sent: 'meeting',
  negotiating: 'meeting',
  won: 'won',
  lost: 'lost',
  not_qualified: 'disqualified',
  nurture: 'contacted',
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
  } else if (newStage === 'replied') {
    updateData.repliedAt = new Date();
  } else if (newStage === 'meeting_booked') {
    updateData.meetingAt = new Date();
  } else if (newStage === 'won' || newStage === 'lost' || newStage === 'not_qualified') {
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
 * Markeer een lead als lost met gestructureerde reden.
 */
export async function markAsLost(
  businessId: string,
  rejectionReason: RejectionReason,
  lostReasonDetail?: string,
): Promise<void> {
  const [pipeline] = await db
    .select()
    .from(schema.leadPipeline)
    .where(eq(schema.leadPipeline.businessId, businessId))
    .limit(1);

  await updatePipelineStage(businessId, 'lost', pipeline?.stage);

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
