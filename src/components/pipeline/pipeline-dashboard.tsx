"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { KanbanSquare } from "lucide-react";
import { PipelineStats } from "./pipeline-stats";
import { PipelineTabs } from "./pipeline-tabs";
import type { PipelineLeadRow } from "./pipeline-tabs";
import { PIPELINE_STAGE_OPTIONS } from "@/lib/constants";

interface PipelineDashboardProps {
  leads: PipelineLeadRow[];
}

export function PipelineDashboard({ leads }: PipelineDashboardProps) {
  const [selectedStage, setSelectedStage] = useState<string | undefined>();
  const tabsRef = useRef<HTMLDivElement>(null);

  // Compute stats from leads
  const stats = useMemo(() => {
    return PIPELINE_STAGE_OPTIONS.map((option) => {
      const stageLeads = leads.filter((l) => l.stage === option.value);
      return {
        stage: option.value,
        count: stageLeads.length,
        totalValue: stageLeads.reduce(
          (sum, l) => sum + (l.wonValue ?? l.dealValue ?? 0),
          0
        ),
      };
    });
  }, [leads]);

  function handleStageClick(stage: string) {
    // Map "new" to "contacted" since "new" has no tab
    const tabStage = stage === "new" ? "contacted" : stage;
    setSelectedStage(tabStage);

    // Scroll to tabs
    setTimeout(() => {
      tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  return (
    <>
      {/* Pipeline stats tiles */}
      <PipelineStats
        stats={stats}
        totalLeads={leads.length}
        onStageClick={handleStageClick}
      />

      {/* Link to full Kanban view */}
      <div className="flex items-center justify-end mb-4">
        <Link
          href="/pipeline/kanban"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-accent transition-colors"
        >
          <KanbanSquare className="h-3.5 w-3.5" />
          Kanban weergave
        </Link>
      </div>

      {/* Tabbed list views */}
      <div ref={tabsRef}>
        <PipelineTabs leads={leads} selectedStage={selectedStage} />
      </div>
    </>
  );
}
