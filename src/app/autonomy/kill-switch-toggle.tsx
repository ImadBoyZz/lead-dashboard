"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/ui/status-dot";

interface SendSettingsResponse {
  sendEnabled: boolean;
  pausedUntil: string | null;
}

export function KillSwitchToggle() {
  const [state, setState] = useState<SendSettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    fetch("/api/settings/system")
      .then((r) => r.json())
      .then(setState)
      .catch(() => setError("Kon status niet laden"));
  }, []);

  function toggle() {
    if (!state) return;
    setError(null);
    const next = !state.sendEnabled;
    startTransition(async () => {
      try {
        const res = await fetch("/api/settings/system", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sendEnabled: next }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "Kon niet opslaan");
          return;
        }
        const fresh: SendSettingsResponse = await fetch(
          "/api/settings/system",
        ).then((r) => r.json());
        setState(fresh);
      } catch {
        setError("Netwerkfout");
      }
    });
  }

  if (!state) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-ink-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Status laden…
      </div>
    );
  }

  const enabled = state.sendEnabled;

  return (
    <div className="flex items-center justify-between gap-6 w-full">
      <div className="flex items-start gap-3 min-w-0">
        <StatusDot variant={enabled ? "success" : "danger"} pulse={!enabled} />
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink">
            {enabled ? "Versturen is actief" : "Versturen is gepauzeerd"}
          </div>
          <p className="text-[12px] text-ink-muted mt-0.5 leading-[1.5]">
            {enabled
              ? "De n8n send-worker pakt elke 5 min approved drafts uit de queue."
              : state.pausedUntil
                ? `Gepauzeerd tot ${new Date(state.pausedUntil).toLocaleString("nl-BE")}`
                : "Er worden geen mails verstuurd tot je heractiveert."}
          </p>
          {error && (
            <p className="text-[12px] text-danger mt-1">{error}</p>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={toggle}
        className={cn(
          "inline-flex items-center font-mono tabular text-[11px] tracking-[0.08em] uppercase",
          "h-8 px-3 rounded-[2px] border transition-colors disabled:opacity-60 shrink-0",
          enabled
            ? "border-[--color-rule-strong] text-ink hover:bg-[--color-surface-hover]"
            : "border-[color:var(--color-success)]/60 text-[color:var(--color-success)] hover:bg-[--color-success-weak]",
        )}
      >
        {pending ? "..." : enabled ? "Pauzeer →" : "Heractiveer →"}
      </button>
    </div>
  );
}
