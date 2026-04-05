"use client";

import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { PipelineCard, type PipelineCardData } from "./pipeline-card";

interface PipelineColumnProps {
  stage: string;
  label: string;
  color: string;
  cards: PipelineCardData[];
}

export function PipelineColumn({ stage, label, color, cards }: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={
        "flex-shrink-0 w-72 rounded-xl border transition-colors " +
        (isOver
          ? "bg-accent/5 border-accent/30"
          : "bg-gray-50/80 border-card-border")
      }
    >
      <div className="p-3 border-b border-card-border">
        <div className="flex items-center justify-between">
          <span
            className={
              "inline-flex items-center rounded-full text-xs font-medium px-2.5 py-0.5 " +
              color
            }
          >
            {label}
          </span>
          <Badge>{cards.length}</Badge>
        </div>
      </div>

      <div className="p-2 space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto">
        {cards.length === 0 ? (
          <p className="text-xs text-muted text-center py-6">Geen leads</p>
        ) : (
          cards.map((card) => (
            <PipelineCard key={card.pipelineId} card={card} />
          ))
        )}
      </div>
    </div>
  );
}
