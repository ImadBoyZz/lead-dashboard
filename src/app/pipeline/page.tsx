export const dynamic = "force-dynamic";

import { eq, desc, and, ne, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Header } from "@/components/layout/header";

import { PipelineDashboard } from "@/components/pipeline/pipeline-dashboard";
import type { PipelineLeadRow } from "@/components/pipeline/pipeline-tabs";
import { parseView } from "@/lib/pipeline/view";

interface PipelinePageProps {
  searchParams: Promise<{ view?: string; stage?: string }>;
}

export default async function PipelinePage({ searchParams }: PipelinePageProps) {
  const params = await searchParams;
  const view = parseView(params.view);
  const selectedStage = params.stage;

  // Fetch pipeline data with business + status + lead score info.
  // Only stages != 'new' show here — warm leads with stage='new' live on /warm
  // (they enter the pipeline automatically via autoTransitionOnOutreach on first contact).
  const data = await db
    .select({
      pipeline: schema.leadPipeline,
      business: schema.businesses,
      leadStatus: schema.leadStatuses,
      leadScore: schema.leadScores,
    })
    .from(schema.leadPipeline)
    .innerJoin(
      schema.businesses,
      eq(schema.leadPipeline.businessId, schema.businesses.id)
    )
    .leftJoin(
      schema.leadStatuses,
      eq(schema.leadStatuses.businessId, schema.businesses.id)
    )
    .leftJoin(
      schema.leadScores,
      eq(schema.leadScores.businessId, schema.businesses.id)
    )
    .where(
      and(
        eq(schema.businesses.optOut, false),
        ne(schema.leadPipeline.stage, "new")
      )
    )
    .orderBy(desc(schema.businesses.createdAt));

  // Latest outreach per business in a single query using DISTINCT ON —
  // fetches only one row per business (the most recent) instead of all rows.
  const pipelineBusinessIds = data.map((row) => row.business.id);
  const latestOutreach = new Map<
    string,
    { channel: string; contactedAt: Date }
  >();

  if (pipelineBusinessIds.length > 0) {
    const outreachData = await db
      .selectDistinctOn([schema.outreachLog.businessId], {
        businessId: schema.outreachLog.businessId,
        channel: schema.outreachLog.channel,
        contactedAt: schema.outreachLog.contactedAt,
      })
      .from(schema.outreachLog)
      .where(
        inArray(schema.outreachLog.businessId, pipelineBusinessIds)
      )
      .orderBy(
        schema.outreachLog.businessId,
        desc(schema.outreachLog.contactedAt)
      );

    for (const o of outreachData) {
      latestOutreach.set(o.businessId, {
        channel: o.channel,
        contactedAt: o.contactedAt,
      });
    }
  }

  const tabLeads: PipelineLeadRow[] = data.map((row) => {
    const outreach = latestOutreach.get(row.business.id);
    return {
      pipelineId: row.pipeline.id,
      businessId: row.business.id,
      name: row.business.name,
      city: row.business.city,
      sector: row.business.sector,
      stage: row.pipeline.stage,
      priority: row.pipeline.priority,
      dealValue: row.pipeline.dealValue,
      wonValue: row.pipeline.wonValue,
      frozen: row.pipeline.frozen,
      leadScore: row.leadScore?.totalScore ?? null,
      leadTemperature: row.business.leadTemperature,
      contactMethod: row.leadStatus?.contactMethod ?? null,
      lastOutreachChannel: outreach?.channel ?? null,
      lastOutreachAt:
        outreach?.contactedAt ?? row.leadStatus?.contactedAt ?? null,
      meetingAt: row.leadStatus?.meetingAt ?? null,
      stageChangedAt: row.pipeline.stageChangedAt,
      rejectionReason: row.pipeline.rejectionReason,
      estimatedCloseDate: row.pipeline.estimatedCloseDate,
      nextFollowUpAt: row.pipeline.nextFollowUpAt,
      email: row.business.email,
      phone: row.business.phone,
      website: row.business.website,
      facebook: row.business.facebook,
    };
  });

  // "Actief" = not frozen, not closed (won/ignored).
  // Closed leads zijn historie, frozen is geparkeerd — allebei geen werk vandaag.
  const activeCount = tabLeads.filter(
    (l) => !l.frozen && l.stage !== "won" && l.stage !== "ignored"
  ).length;
  const closedCount = tabLeads.filter(
    (l) => l.stage === "won" || l.stage === "ignored"
  ).length;
  const frozenCount = tabLeads.filter((l) => l.frozen).length;

  const descParts = [`${activeCount} actief`];
  if (frozenCount > 0) descParts.push(`${frozenCount} frozen`);
  if (closedCount > 0) descParts.push(`${closedCount} afgesloten`);

  return (
    <div>
      <Header title="Pipeline" description={descParts.join(" · ")} />

      <PipelineDashboard
        leads={tabLeads}
        view={view}
        selectedStage={selectedStage}
        activeCount={activeCount}
      />
    </div>
  );
}
