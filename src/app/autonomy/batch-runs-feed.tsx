"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";

interface BatchRun {
  id: string;
  jobType: string;
  runDate: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  inputCount: number | null;
  outputCount: number | null;
  skippedReasons: Record<string, unknown> | null;
  errorMessage: string | null;
  costEur: number | null;
  metadata: Record<string, unknown> | null;
  durationMs: number | null;
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "idle" | "running"> = {
  ok: "success",
  running: "running",
  skipped: "idle",
  error: "danger",
};

const JOB_LABEL: Record<string, string> = {
  discover: "Discovery",
  "generate-drafts": "Draft generation",
  "deliverability-check": "Deliverability check",
  "qualification-batch": "Qualification",
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 30_000) return "zojuist";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s geleden`;
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m geleden`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}u geleden`;
  return new Date(iso).toLocaleDateString("nl-BE", { day: "2-digit", month: "short" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function BatchRunsFeed() {
  const [runs, setRuns] = useState<BatchRun[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchRuns() {
      try {
        const res = await fetch("/api/autonomy/runs?limit=30", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setError("Kon feed niet laden");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setRuns(data.runs);
        setLastFetch(Date.now());
        setError(null);
      } catch {
        if (!cancelled) setError("Netwerkfout");
      }
    }

    fetchRuns();
    const id = setInterval(fetchRuns, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (runs === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted py-6">
        <Loader2 className="h-4 w-4 animate-spin" />
        Runs laden…
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted">Nog geen cron runs gelogd.</p>
        <p className="text-xs text-muted-foreground mt-1">
          De eerste draait op maandag 05:00 (discovery) en 06:00 (qualification).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.08em] text-muted-foreground pb-2 border-b border-[--color-border-subtle]">
        <span>{runs.length} recente runs</span>
        <span className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full bg-accent motion-pulse"
            aria-hidden
          />
          Live feed · elke 30s
          {lastFetch && (
            <span className="text-muted">
              · laatst {formatTime(new Date(lastFetch).toISOString())}
            </span>
          )}
        </span>
      </div>

      {error && (
        <div className="text-xs text-danger py-2">{error}</div>
      )}

      <ul className="divide-y divide-[--color-border-subtle]">
        {runs.map((r) => {
          const variant = STATUS_VARIANT[r.status] ?? "idle";
          const label = JOB_LABEL[r.jobType] ?? r.jobType;
          const isOpen = expanded.has(r.id);
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => toggle(r.id)}
                aria-expanded={isOpen}
                className={cn(
                  "w-full grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto] items-center gap-3 py-2.5 text-left",
                  "hover:bg-[--color-surface-hover] px-2 -mx-2 rounded-sm transition-colors",
                )}
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform",
                    isOpen && "rotate-90",
                  )}
                />
                <StatusDot variant={variant} pulse={r.status === "running"} />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm text-foreground truncate">{label}</span>
                  <span className="text-[11px] text-muted-foreground font-mono tabular">
                    {formatTime(r.startedAt)} · {formatRelative(r.startedAt)}
                  </span>
                </div>
                <div className="text-xs text-muted font-mono tabular">
                  {r.inputCount !== null && (
                    <span>
                      in <span className="text-foreground">{r.inputCount}</span>
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted font-mono tabular">
                  {r.outputCount !== null && (
                    <span>
                      out <span className="text-foreground">{r.outputCount}</span>
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground font-mono tabular">
                  {formatDuration(r.durationMs)}
                </div>
                <div className="text-xs text-muted-foreground font-mono tabular text-right w-14">
                  {r.costEur !== null ? `€${r.costEur.toFixed(3)}` : "—"}
                </div>
              </button>

              {isOpen && (
                <div className="motion-fade-in ml-7 mb-3 mr-2 rounded-md bg-[--color-surface-hover] p-3 space-y-2">
                  {r.errorMessage && (
                    <div className="text-xs">
                      <div className="uppercase tracking-[0.08em] text-[10px] text-danger mb-1">
                        Error
                      </div>
                      <pre className="text-xs text-foreground font-mono whitespace-pre-wrap break-words">
                        {r.errorMessage}
                      </pre>
                    </div>
                  )}
                  {r.skippedReasons && Object.keys(r.skippedReasons).length > 0 && (
                    <div>
                      <div className="uppercase tracking-[0.08em] text-[10px] text-muted-foreground mb-1">
                        Skipped reasons
                      </div>
                      <pre className="text-xs text-foreground font-mono whitespace-pre-wrap break-words">
                        {JSON.stringify(r.skippedReasons, null, 2)}
                      </pre>
                    </div>
                  )}
                  {r.metadata && Object.keys(r.metadata).length > 0 && (
                    <div>
                      <div className="uppercase tracking-[0.08em] text-[10px] text-muted-foreground mb-1">
                        Metadata
                      </div>
                      <pre className="text-xs text-foreground font-mono whitespace-pre-wrap break-words">
                        {JSON.stringify(r.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground font-mono tabular pt-1">
                    run_id: {r.id} · finished:{" "}
                    {r.finishedAt ? formatTime(r.finishedAt) : "—"}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
