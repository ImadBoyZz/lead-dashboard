"use client";

import { useEffect, useState } from "react";
import { StatusDot } from "@/components/ui/status-dot";

type HealthState = "green" | "yellow" | "red" | "unknown";

interface HealthResponse {
  state: HealthState;
  sendEnabled: boolean;
  pausedReason: string | null;
  budgetPct: number;
  runningCount: number;
  failedRecent: number;
}

const STATE_TO_VARIANT = {
  green: "success",
  yellow: "warning",
  red: "danger",
  unknown: "idle",
} as const;

const STATE_TO_LABEL = {
  green: "Systeem actief",
  yellow: "Aandacht vereist",
  red: "Send gepauzeerd",
  unknown: "Status onbekend",
} as const;

export function SidebarHealthDot() {
  const [data, setData] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchHealth() {
      try {
        const res = await fetch("/api/autonomy/health");
        if (!res.ok) return;
        const json = (await res.json()) as HealthResponse;
        if (!cancelled) setData(json);
      } catch {
        // laat vorige state staan
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
  const variant = STATE_TO_VARIANT[state];
  const label = data?.pausedReason ?? STATE_TO_LABEL[state];

  return (
    <div className="flex items-center gap-2 px-1 py-1.5" role="status" aria-live="polite">
      <StatusDot
        variant={variant}
        size="sm"
        pulse={state === "red"}
      />
      <span className="text-[11px] text-sidebar-foreground/60 truncate" title={label}>
        {label}
      </span>
    </div>
  );
}
