export const dynamic = 'force-dynamic';

import { eq, desc, and, or, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Header } from "@/components/layout/header";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import type { PipelineCardData } from "@/components/pipeline/pipeline-card";

export default async function PipelinePage() {
  const data = await db
    .select({
      pipeline: schema.leadPipeline,
      business: schema.businesses,
    })
    .from(schema.leadPipeline)
    .innerJoin(schema.businesses, eq(schema.leadPipeline.businessId, schema.businesses.id))
    .where(
      and(
        eq(schema.businesses.optOut, false),
        or(
          ne(schema.leadPipeline.stage, 'new'),
          eq(schema.businesses.leadTemperature, 'warm'),
        ),
      ),
    )
    .orderBy(desc(schema.businesses.createdAt));

  const cards: PipelineCardData[] = data.map((row) => ({
    pipelineId: row.pipeline.id,
    businessId: row.business.id,
    name: row.business.name,
    city: row.business.city,
    stage: row.pipeline.stage,
    priority: row.pipeline.priority,
    stageChangedAt: row.pipeline.stageChangedAt,
  }));

  return (
    <div>
      <Header
        title="Pipeline"
        description={`${cards.length} leads in pipeline`}
      />
      <PipelineBoard initialData={cards} />
    </div>
  );
}
