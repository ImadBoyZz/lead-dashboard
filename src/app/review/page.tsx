import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { ReviewBoard } from './review-board';

export const dynamic = 'force-dynamic';

async function fetchPendingDrafts() {
  const rows = await db
    .select({
      id: schema.outreachDrafts.id,
      businessId: schema.outreachDrafts.businessId,
      channel: schema.outreachDrafts.channel,
      subject: schema.outreachDrafts.subject,
      body: schema.outreachDrafts.body,
      tone: schema.outreachDrafts.tone,
      status: schema.outreachDrafts.status,
      createdAt: schema.outreachDrafts.createdAt,
      businessName: schema.businesses.name,
      businessSector: schema.businesses.sector,
      businessCity: schema.businesses.city,
      businessWebsite: schema.businesses.website,
      businessEmail: schema.businesses.email,
      chainClassification: schema.businesses.chainClassification,
      chainConfidence: schema.businesses.chainConfidence,
      websiteVerdict: schema.businesses.websiteVerdict,
    })
    .from(schema.outreachDrafts)
    .innerJoin(
      schema.businesses,
      eq(schema.outreachDrafts.businessId, schema.businesses.id),
    )
    .where(
      and(
        eq(schema.outreachDrafts.status, 'pending'),
        eq(schema.businesses.optOut, false),
        eq(schema.businesses.blacklisted, false),
      )!,
    )
    .orderBy(desc(schema.outreachDrafts.createdAt))
    .limit(200);

  return rows;
}

export default async function ReviewPage() {
  const drafts = await fetchPendingDrafts();

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review wachtrij</h1>
          <p className="text-sm text-muted mt-1">
            Goedkeuren of afwijzen van alle pending drafts, ongeacht campagne.
          </p>
        </div>
        <span className="text-sm text-muted">
          {drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'} wacht op beslissing
        </span>
      </header>

      {drafts.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-card p-8 text-center">
          <p className="text-sm text-muted">Geen pending drafts — alles is bijgewerkt.</p>
        </div>
      ) : (
        <ReviewBoard initialDrafts={drafts} />
      )}
    </div>
  );
}
