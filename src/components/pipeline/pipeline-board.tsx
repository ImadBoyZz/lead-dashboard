"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { PipelineColumn } from "./pipeline-column";
import { PipelineCard, type PipelineCardData } from "./pipeline-card";
import { PIPELINE_STAGE_OPTIONS } from "@/lib/constants";

interface PipelineBoardProps {
  initialData: PipelineCardData[];
}

export function PipelineBoard({ initialData }: PipelineBoardProps) {
  const [cards, setCards] = useState(initialData);
  const [activeCard, setActiveCard] = useState<PipelineCardData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(event: DragStartEvent) {
    const card = cards.find((c) => c.pipelineId === event.active.id);
    setActiveCard(card ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const cardId = active.id as string;
    const newStage = over.id as string;
    const card = cards.find((c) => c.pipelineId === cardId);
    if (!card || card.stage === newStage) return;

    // Optimistic update
    setCards((prev) =>
      prev.map((c) =>
        c.pipelineId === cardId ? { ...c, stage: newStage } : c
      )
    );

    try {
      await fetch(`/api/pipeline/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
    } catch {
      // Revert on error
      setCards((prev) =>
        prev.map((c) =>
          c.pipelineId === cardId ? { ...c, stage: card.stage } : c
        )
      );
    }
  }

  // Group by stage
  const grouped: Record<string, PipelineCardData[]> = {};
  for (const option of PIPELINE_STAGE_OPTIONS) {
    grouped[option.value] = [];
  }
  for (const card of cards) {
    if (grouped[card.stage]) {
      grouped[card.stage].push(card);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
        {PIPELINE_STAGE_OPTIONS.map((option) => (
          <PipelineColumn
            key={option.value}
            stage={option.value}
            label={option.label}
            color={option.color}
            cards={grouped[option.value] ?? []}
          />
        ))}
      </div>

      <DragOverlay>
        {activeCard ? <PipelineCard card={activeCard} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
