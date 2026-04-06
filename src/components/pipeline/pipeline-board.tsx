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
import { MeetingDateModal } from "./meeting-date-modal";
import { PIPELINE_STAGE_OPTIONS } from "@/lib/constants";

interface PipelineBoardProps {
  initialData: PipelineCardData[];
}

export function PipelineBoard({ initialData }: PipelineBoardProps) {
  const [cards, setCards] = useState(initialData);
  const [activeCard, setActiveCard] = useState<PipelineCardData | null>(null);

  // Meeting modal state
  const [meetingModal, setMeetingModal] = useState<{
    open: boolean;
    cardId: string;
    leadName: string;
    oldStage: string;
  }>({ open: false, cardId: "", leadName: "", oldStage: "" });

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

    // If dragging to "meeting", show date modal instead of immediate update
    if (newStage === "meeting") {
      // Optimistic: move card visually
      setCards((prev) =>
        prev.map((c) =>
          c.pipelineId === cardId ? { ...c, stage: newStage } : c
        )
      );
      setMeetingModal({
        open: true,
        cardId,
        leadName: card.name,
        oldStage: card.stage,
      });
      return;
    }

    // Normal stage change
    await moveCard(cardId, newStage, card.stage);
  }

  async function moveCard(
    cardId: string,
    newStage: string,
    oldStage: string,
    meetingAt?: string
  ) {
    // Optimistic update
    setCards((prev) =>
      prev.map((c) =>
        c.pipelineId === cardId ? { ...c, stage: newStage } : c
      )
    );

    try {
      const body: Record<string, string> = { stage: newStage };
      if (meetingAt) body.meetingAt = meetingAt;

      await fetch(`/api/pipeline/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // Revert on error
      setCards((prev) =>
        prev.map((c) =>
          c.pipelineId === cardId ? { ...c, stage: oldStage } : c
        )
      );
    }
  }

  function handleMeetingConfirm(dateTime: string) {
    const { cardId, oldStage } = meetingModal;
    setMeetingModal((prev) => ({ ...prev, open: false }));
    moveCard(cardId, "meeting", oldStage, dateTime);
  }

  function handleMeetingCancel() {
    // Revert the optimistic move
    const { cardId, oldStage } = meetingModal;
    setCards((prev) =>
      prev.map((c) =>
        c.pipelineId === cardId ? { ...c, stage: oldStage } : c
      )
    );
    setMeetingModal((prev) => ({ ...prev, open: false }));
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
    <>
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

      <MeetingDateModal
        open={meetingModal.open}
        leadName={meetingModal.leadName}
        onConfirm={handleMeetingConfirm}
        onCancel={handleMeetingCancel}
      />
    </>
  );
}
