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

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "danger" | "idle" | "running"
> = {
  ok: "success",
  running: "running",
  skipped: "idle",
  error: "danger",
};

const JOB_LABEL: Record<string, string> = {
  discover: "Discovery",
  "generate-drafts": "Draft generation",
  "deliverability-check": "Deliverability",
  "qualification-batch": "Qualification",
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m${sec.toString().padStart(2, "0")}s`;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 30_000) return "zojuist";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}u`;
  return new Date(iso).toLocaleDateString("nl-BE", {
    day: "2-digit",
    month: "short",
  });
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
        const res = await fetch("/api/autonomy/runs?limit=30", {
          cache: "no-store",
        });
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
      <div className="flex items-center gap-2 text-[12.5px] text-ink-muted py-6">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Runs laden…
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="py-10 text-center border border-dashed border-[--color-rule] rounded-[2px]">
        <p className="text-[13px] text-ink-muted">Nog geen cron runs gelogd.</p>
        <p className="text-[11.5px] text-ink-soft mt-1 font-mono tabular">
          Eerste run maandag 05:00 (discovery) / 06:00 (qualification)
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-[--color-rule]">
        <div className="module-label">
          {runs.length} recente runs · live feed
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono tabular text-ink-soft">
          <span
            className="w-1.5 h-1.5 rounded-full bg-accent motion-pulse"
            aria-hidden
          />
          30s refresh
          {lastFetch && (
            <span>
              · {formatTime(new Date(lastFetch).toISOString())}
            </span>
          )}
        </div>
      </div>

      {error && <div className="text-[12px] text-danger py-2">{error}</div>}

      <ul className="divide-y divide-[--color-rule]">
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
                  "w-full grid grid-cols-[16px_20px_1fr_80px_80px_70px_70px] items-center gap-3 py-3 text-left",
                  "hover:bg-[--color-surface-hover] -mx-3 px-3 transition-colors",
                )}
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 text-ink-soft shrink-0 transition-transform",
                    isOpen && "rotate-90",
                  )}
                />
                <StatusDot
                  variant={variant}
                  pulse={r.status === "running"}
                  size="sm"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] text-ink truncate">{label}</span>
                  <span className="text-[11px] text-ink-soft font-mono tabular">
                    {formatTime(r.startedAt)} · {formatRelative(r.startedAt)}
                  </span>
                </div>
                <div className="text-[11.5px] font-mono tabular text-ink-soft">
                  {r.inputCount !== null ? (
                    <>
                      <span className="text-ink-soft">in </span>
                      <span className="text-ink">{r.inputCount}</span>
                    </>
                  ) : null}
                </div>
                <div className="text-[11.5px] font-mono tabular text-ink-soft">
                  {r.outputCount !== null ? (
                    <>
                      <span className="text-ink-soft">out </span>
                      <span className="text-ink">{r.outputCount}</span>
                    </>
                  ) : null}
                </div>
                <div className="text-[11.5px] font-mono tabular text-ink-soft text-right">
                  {formatDuration(r.durationMs)}
                </div>
                <div className="text-[11.5px] font-mono tabular text-ink-soft text-right">
                  {r.costEur !== null ? `€${r.costEur.toFixed(3)}` : "—"}
                </div>
              </button>

              {isOpen && (
                <div className="motion-fade-in ml-7 mb-3 mr-3 border border-[--color-rule] bg-[--color-surface-alt] p-4 space-y-3 rounded-[2px]">
                  {r.errorMessage && (
                    <div>
                      <div className="module-label text-danger mb-1">
                        Error
                      </div>
                      <pre className="text-[12px] text-ink font-mono whitespace-pre-wrap break-words">
                        {r.errorMessage}
                      </pre>
                    </div>
                  )}
                  {r.skippedReasons &&
                    Object.keys(r.skippedReasons).length > 0 && (
                      <div>
                        <div className="module-label mb-1">
                          Skipped reasons
                        </div>
                        <pre className="text-[12px] text-ink font-mono whitespace-pre-wrap break-words">
                          {JSON.stringify(r.skippedReasons, null, 2)}
                        </pre>
                      </div>
                    )}
                  {r.metadata && Object.keys(r.metadata).length > 0 && (
                    <div>
                      <div className="module-label mb-1">Metadata</div>
                      <pre className="text-[12px] text-ink font-mono whitespace-pre-wrap break-words">
                        {JSON.stringify(r.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div className="text-[11px] text-ink-soft font-mono tabular pt-1 border-t border-[--color-rule]">
                    run_id {r.id} · finished{" "}
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
