"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ScoreBadge } from "@/components/leads/score-badge";
import { PRIORITY_OPTIONS } from "@/lib/constants";

export interface PipelineCardData {
  pipelineId: string;
  businessId: string;
  name: string;
  city: string | null;
  score: number | null;
  stage: string;
  priority: string;
  stageChangedAt: Date | string;
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

  const days = (() => {
    if (!card.stageChangedAt) return null;
    const diff = Date.now() - new Date(card.stageChangedAt).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  })();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={
        "block bg-white rounded-lg border border-card-border p-3 cursor-grab active:cursor-grabbing transition-all " +
        (isOverlay ? "shadow-lg ring-2 ring-accent/20" : "hover:shadow-sm hover:border-accent/30")
      }
    >
      <Link href={"/leads/" + card.businessId} className="block" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium text-foreground truncate">
          {card.name}
        </p>
        <p className="text-xs text-muted mt-0.5">
          {card.city ?? "Onbekend"}
        </p>
      </Link>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          <ScoreBadge score={card.score} />
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
        </div>
        {days !== null && (
          <span className="text-xs text-muted">{days}d</span>
        )}
      </div>
    </div>
  );
}
