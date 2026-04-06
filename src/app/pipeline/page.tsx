export const dynamic = "force-dynamic";

import { eq, desc, and, or, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Header } from "@/components/layout/header";
import { UrgentBanner } from "@/components/pipeline/urgent-banner";
import { PipelineDashboard } from "@/components/pipeline/pipeline-dashboard";
import type { PipelineLeadRow } from "@/components/pipeline/pipeline-tabs";
import { getUrgentLeadsToday } from "@/lib/pipeline-logic";

export default async function PipelinePage() {
  // Fetch pipeline data with business + outreach info
  const data = await db
    .select({
      pipeline: schema.leadPipeline,
      business: schema.businesses,
      leadStatus: schema.leadStatuses,
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
    .where(
      and(
        eq(schema.businesses.optOut, false),
        or(
          ne(schema.leadPipeline.stage, "new"),
          eq(schema.businesses.leadTemperature, "warm")
        )
      )
    )
    .orderBy(desc(schema.businesses.createdAt));

  // Get last outreach per business for channel info
  const outreachData = await db
    .select({
      businessId: schema.outreachLog.businessId,
      channel: schema.outreachLog.channel,
      contactedAt: schema.outreachLog.contactedAt,
    })
    .from(schema.outreachLog)
    .orderBy(desc(schema.outreachLog.contactedAt));

  // Build a map of latest outreach per business
  const latestOutreach = new Map<
    string,
    { channel: string; contactedAt: Date }
  >();
  for (const o of outreachData) {
    if (!latestOutreach.has(o.businessId)) {
      latestOutreach.set(o.businessId, {
        channel: o.channel,
        contactedAt: o.contactedAt,
      });
    }
  }

  // Tab list rows (richer data)
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
      contactMethod: row.leadStatus?.contactMethod ?? null,
      lastOutreachChannel: outreach?.channel ?? null,
      lastOutreachAt:
        outreach?.contactedAt ?? row.leadStatus?.contactedAt ?? null,
      meetingAt: row.leadStatus?.meetingAt ?? null,
      stageChangedAt: row.pipeline.stageChangedAt,
      rejectionReason: row.pipeline.rejectionReason,
      estimatedCloseDate: row.pipeline.estimatedCloseDate,
      nextFollowUpAt: row.pipeline.nextFollowUpAt,
    };
  });

  // Urgent leads
  const urgentLeads = await getUrgentLeadsToday();

  return (
    <div>
      <Header
        title="Pipeline"
        description={`${data.length} leads in pipeline`}
      />

      {/* Compact urgency strip */}
      <UrgentBanner leads={urgentLeads} />

      {/* Stats + tabbed lists */}
      <PipelineDashboard leads={tabLeads} />
    </div>
  );
}
