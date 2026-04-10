"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { PIPELINE_STAGE_OPTIONS } from "@/lib/constants";

interface InlineStagePickerProps {
  pipelineId: string;
  currentStage: string;
  /** Stages die niet gekozen kunnen worden (bv. de huidige) */
  excludeStages?: string[];
}

// Volgorde waarin stages getoond worden in de picker (logisch → gewonnen/genegeerd onderaan)
const PICKER_STAGES = [
  "contacted",
  "quote_sent",
  "meeting",
  "won",
  "ignored",
];

/**
 * Kleine dropdown om een lead in één klik naar een andere stage te verplaatsen.
 * Zonder popover library — gewoon absolute positioned menu met outside-click close.
 */
export function InlineStagePicker({
  pipelineId,
  currentStage,
  excludeStages = [],
}: InlineStagePickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function handleSelect(newStage: string) {
    if (newStage === currentStage) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/pipeline/${pipelineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      if (!res.ok) throw new Error("Failed");
      router.refresh();
    } catch {
      alert("Kon stage niet wijzigen — probeer opnieuw");
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  const excluded = new Set([currentStage, ...excludeStages]);
  const options = PICKER_STAGES.filter((s) => !excluded.has(s));

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className="inline-flex items-center gap-1 rounded border border-card-border bg-white px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
        title="Verplaats naar andere stage"
      >
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            Verplaats <ChevronDown className="h-3 w-3" />
          </>
        )}
      </button>
      {open && !saving && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-card-border bg-white shadow-xl">
          {options.map((stageValue) => {
            const option = PIPELINE_STAGE_OPTIONS.find(
              (o) => o.value === stageValue
            );
            return (
              <button
                key={stageValue}
                onClick={() => handleSelect(stageValue)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-gray-50"
              >
                <span
                  className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] ${option?.color ?? "bg-gray-100"}`}
                >
                  {option?.label ?? stageValue}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
