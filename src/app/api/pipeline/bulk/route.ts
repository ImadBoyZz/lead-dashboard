import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { updatePipelineStage, freezeLead, unfreezeLead } from "@/lib/pipeline-logic";

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(["stage", "freeze", "unfreeze"]),
  stage: z
    .enum(["new", "contacted", "quote_sent", "meeting", "won", "ignored"])
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { ids, action, stage } = parsed.data;

    // Fetch all affected pipeline rows in one shot so we can sync statuses
    // and respect the updatePipelineStage() contract (needs old stage + businessId).
    const rows = await db
      .select({
        id: schema.leadPipeline.id,
        businessId: schema.leadPipeline.businessId,
        stage: schema.leadPipeline.stage,
      })
      .from(schema.leadPipeline)
      .where(inArray(schema.leadPipeline.id, ids));

    if (rows.length === 0) {
      return NextResponse.json({ updated: 0 });
    }

    if (action === "stage") {
      if (!stage) {
        return NextResponse.json(
          { error: "stage is required for stage action" },
          { status: 400 }
        );
      }
      // Use updatePipelineStage per row to keep leadStatuses + statusHistory in sync
      for (const row of rows) {
        if (row.stage === stage) continue;
        await updatePipelineStage(row.businessId, stage, row.stage);
      }
      return NextResponse.json({ updated: rows.length, action, stage });
    }

    if (action === "freeze") {
      for (const row of rows) {
        await freezeLead(row.businessId);
      }
      return NextResponse.json({ updated: rows.length, action });
    }

    if (action === "unfreeze") {
      // Only unfreeze rows that are currently frozen to avoid accidental churn
      const frozenRows = await db
        .select({
          id: schema.leadPipeline.id,
          businessId: schema.leadPipeline.businessId,
        })
        .from(schema.leadPipeline)
        .where(
          inArray(schema.leadPipeline.id, ids)
        );

      let count = 0;
      for (const row of frozenRows) {
        const ok = await unfreezeLead(row.businessId);
        if (ok) count++;
      }
      return NextResponse.json({ updated: count, action });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Bulk pipeline error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

