"use client";

import { useEffect, useState } from "react";

type HealthState = "green" | "yellow" | "red" | "unknown";

interface HealthResponse {
  state: HealthState;
  sendEnabled: boolean;
  pausedReason: string | null;
  budgetPct: number;
  runningCount: number;
  failedRecent: number;
}

const GLYPH = {
  green: { ch: "●", color: "text-success", label: "Systeem actief" },
  yellow: { ch: "◐", color: "text-warning", label: "Aandacht vereist" },
  red: { ch: "■", color: "text-danger", label: "Send gepauzeerd" },
  unknown: { ch: "○", color: "text-ink-soft", label: "Status onbekend" },
} as const;

export function SidebarHealthDot() {
  const [data, setData] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchHealth() {
      try {
        const res = await fetch("/api/autonomy/health");
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as HealthResponse;
        if (!cancelled) setData(json);
      } catch {
        // keep prior state
      }
    }

    fetchHealth();
    const id = setInterval(fetchHealth, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const state: HealthState = data?.state ?? "unknown";
  const glyph = GLYPH[state];
  const label = data?.pausedReason ?? glyph.label;

  return (
    <div className="px-3 space-y-1" role="status" aria-live="polite">
      <div className="module-label">§ status</div>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={`font-mono text-[14px] leading-none ${glyph.color} ${
            state === "red" ? "motion-pulse" : ""
          }`}
        >
          {glyph.ch}
        </span>
        <span
          className="text-[12px] text-ink-muted truncate"
          title={label}
        >
          {label}
        </span>
      </div>
      {data && (
        <div className="flex items-center gap-3 text-[10.5px] font-mono tabular text-ink-soft pl-5">
          <span>
            budget <span className="text-ink-muted">{data.budgetPct}%</span>
          </span>
          {data.runningCount > 0 && (
            <span className="text-accent">running {data.runningCount}</span>
          )}
          {data.failedRecent > 0 && (
            <span className="text-danger">errors {data.failedRecent}</span>
          )}
        </div>
      )}
    </div>
  );
}
