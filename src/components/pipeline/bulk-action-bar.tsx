"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Snowflake, ArrowRight, Loader2 } from "lucide-react";
import { PIPELINE_STAGE_OPTIONS } from "@/lib/constants";

interface BulkActionBarProps {
  selectedIds: string[];
  onClear: () => void;
}

const STAGE_TARGETS = [
  "contacted",
  "quote_sent",
  "meeting",
  "won",
  "ignored",
];

export function BulkActionBar({ selectedIds, onClear }: BulkActionBarProps) {
  const router = useRouter();
  const [stageMenuOpen, setStageMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (selectedIds.length === 0) return null;

  async function runBulk(action: string, payload?: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch("/api/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, action, ...payload }),
      });
      if (!res.ok) throw new Error("Bulk failed");
      onClear();
      router.refresh();
    } catch {
      alert("Bulk actie mislukt");
    } finally {
      setSaving(false);
      setStageMenuOpen(false);
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-card-border bg-white px-4 py-2.5 shadow-xl">
        <span className="text-xs font-semibold text-foreground">
          {selectedIds.length} geselecteerd
        </span>
        <div className="h-4 w-px bg-card-border" />

        {/* Stage menu */}
        <div className="relative">
          <button
            onClick={() => setStageMenuOpen((v) => !v)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
            Verplaats naar
          </button>
          {stageMenuOpen && !saving && (
            <div className="absolute bottom-full left-0 mb-2 w-48 overflow-hidden rounded-lg border border-card-border bg-white shadow-xl">
              {STAGE_TARGETS.map((stage) => {
                const opt = PIPELINE_STAGE_OPTIONS.find((o) => o.value === stage);
                return (
                  <button
                    key={stage}
                    onClick={() => runBulk("stage", { stage })}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-gray-50"
                  >
                    <span
                      className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] ${opt?.color ?? "bg-gray-100"}`}
                    >
                      {opt?.label ?? stage}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => runBulk("freeze")}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-full border border-card-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
          title="Parkeer buiten actieve queue"
        >
          <Snowflake className="h-3.5 w-3.5" />
          Freeze
        </button>

        <button
          onClick={() => runBulk("unfreeze")}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-full border border-card-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
          title="Terug naar actieve queue"
        >
          Unfreeze
        </button>

        <div className="h-4 w-px bg-card-border" />

        <button
          onClick={onClear}
          disabled={saving}
          className="rounded-full p-1 text-muted hover:bg-gray-100 hover:text-foreground"
          title="Deselecteer alles"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
