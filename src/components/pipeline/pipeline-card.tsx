"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { PRIORITY_OPTIONS } from "@/lib/constants";
import { StaleBadge } from "./stale-badge";
import { ScorePill } from "./score-pill";

export interface PipelineCardData {
  pipelineId: string;
  businessId: string;
  name: string;
  city: string | null;
  stage: string;
  priority: string;
  stageChangedAt: Date | string;
  leadScore?: number | null;
  dealValue?: number | null;
}

interface PipelineCardProps {
  card: PipelineCardData;
  isOverlay?: boolean;
}

export function PipelineCard({ card, isOverlay }: PipelineCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: card.pipelineId,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const priorityConfig = PRIORITY_OPTIONS.find((p) => p.value === card.priority);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={
        "block bg-white rounded-lg border border-card-border p-3 cursor-grab active:cursor-grabbing transition-all " +
        (isOverlay
          ? "shadow-lg ring-2 ring-accent/20"
          : "hover:shadow-sm hover:border-accent/30")
      }
    >
      <Link
        href={"/leads/" + card.businessId}
        className="block"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground truncate flex-1">
            {card.name}
          </p>
          <ScorePill score={card.leadScore} />
        </div>
        <p className="text-xs text-muted mt-0.5">{card.city ?? "Onbekend"}</p>
      </Link>
      <div className="flex items-center justify-between mt-2 gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {priorityConfig && card.priority !== "medium" && (
            <span
              className={
                "inline-flex items-center rounded-full text-[10px] font-medium px-1.5 py-0.5 " +
                priorityConfig.color
              }
            >
              {priorityConfig.label}
            </span>
          )}
          {card.dealValue && card.dealValue > 0 && (
            <span className="text-[11px] font-semibold text-foreground">
              €{card.dealValue.toLocaleString("nl-BE")}
            </span>
          )}
        </div>
        <StaleBadge stageChangedAt={card.stageChangedAt} />
      </div>
    </div>
  );
}
