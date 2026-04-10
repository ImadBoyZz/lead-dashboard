"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { PipelineStats } from "./pipeline-stats";
import { PipelineTabs } from "./pipeline-tabs";
import type { PipelineLeadRow } from "./pipeline-tabs";
import { PipelineBoard } from "./pipeline-board";
import type { PipelineCardData } from "./pipeline-card";
import { PIPELINE_STAGE_OPTIONS } from "@/lib/constants";
import { PipelineViewSwitcher } from "./pipeline-view-switcher";
import type { PipelineView } from "@/lib/pipeline/view";
import { CapacityMeter } from "./capacity-meter";
import { TodayView } from "./today-view";
import { MoneyView } from "./money-view";

interface PipelineDashboardProps {
  leads: PipelineLeadRow[];
  view: PipelineView;
  selectedStage?: string;
  activeCount: number;
}

export function PipelineDashboard({
  leads,
  view,
  selectedStage,
  activeCount,
}: PipelineDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Stats exclude frozen zodat de "actieve queue" telt wat je echt werkt.
  const { stats, frozenCount } = useMemo(() => {
    const activeLeads = leads.filter((l) => !l.frozen);
    const frozen = leads.length - activeLeads.length;
    const computed = PIPELINE_STAGE_OPTIONS.map((option) => {
      const stageLeads = activeLeads.filter((l) => l.stage === option.value);
      return {
        stage: option.value,
        count: stageLeads.length,
        totalValue: stageLeads.reduce(
          (sum, l) => sum + (l.wonValue ?? l.dealValue ?? 0),
          0
        ),
      };
    });
    return { stats: computed, frozenCount: frozen };
  }, [leads]);

  // Stat card click schrijft stage naar URL en switcht naar list view.
  function handleStageClick(stage: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "list");
    // "new" heeft geen tab in list view → map naar contacted
    params.set("stage", stage === "new" ? "contacted" : stage);
    router.push(`${pathname}?${params.toString()}`);
  }

  // Kanban board data (zelfde leads, simpeler shape).
  const boardCards: PipelineCardData[] = useMemo(
    () =>
      leads
        .filter((l) => !l.frozen)
        .map((l) => ({
          pipelineId: l.pipelineId,
          businessId: l.businessId,
          name: l.name,
          city: l.city,
          stage: l.stage,
          priority: l.priority,
          stageChangedAt: l.stageChangedAt,
          leadScore: l.leadScore,
          dealValue: l.dealValue,
        })),
    [leads]
  );

  return (
    <>
      {/* Header strip: view switcher + capacity meter */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <PipelineViewSwitcher current={view} />
        <CapacityMeter active={activeCount} />
      </div>

      {/* Stats tiles altijd zichtbaar als context */}
      <PipelineStats
        stats={stats}
        totalLeads={leads.length - frozenCount}
        frozenCount={frozenCount}
        onStageClick={handleStageClick}
      />

      {/* View-specifieke content */}
      {view === "today" && <TodayView leads={leads} />}
      {view === "money" && <MoneyView leads={leads} />}
      {view === "board" && <PipelineBoard initialData={boardCards} />}
      {view === "list" && (
        <PipelineTabs leads={leads} selectedStage={selectedStage} />
      )}
    </>
  );
}
