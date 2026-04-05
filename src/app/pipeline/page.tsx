export const dynamic = 'force-dynamic';

import { eq, desc } from "drizzle-orm";
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
      score: schema.leadScores,
    })
    .from(schema.leadPipeline)
    .innerJoin(schema.businesses, eq(schema.leadPipeline.businessId, schema.businesses.id))
    .leftJoin(schema.leadScores, eq(schema.businesses.id, schema.leadScores.businessId))
    .where(eq(schema.businesses.optOut, false))
    .orderBy(desc(schema.leadScores.totalScore));

  const cards: PipelineCardData[] = data.map((row) => ({
    pipelineId: row.pipeline.id,
    businessId: row.business.id,
    name: row.business.name,
    city: row.business.city,
    score: row.score?.totalScore ?? null,
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
