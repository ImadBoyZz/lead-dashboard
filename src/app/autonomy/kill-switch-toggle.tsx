"use client";

import { useEffect, useState, useTransition } from "react";
import { Pause, Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
        const fresh: SendSettingsResponse = await fetch("/api/settings/system").then((r) =>
          r.json(),
        );
        setState(fresh);
      } catch {
        setError("Netwerkfout");
      }
    });
  }

  if (!state) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Status laden…
      </div>
    );
  }

  const enabled = state.sendEnabled;

  return (
    <div className="flex items-center justify-between gap-4 w-full">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-full shrink-0",
            enabled
              ? "bg-green-50 text-success"
              : "bg-red-50 text-danger",
          )}
          aria-hidden
        >
          {enabled ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {enabled ? "Versturen staat aan" : "Versturen is gepauzeerd"}
          </div>
          <p className="text-xs text-muted mt-0.5 truncate">
            {enabled
              ? "n8n send-worker pakt approved drafts uit de queue."
              : state.pausedUntil
                ? `Gepauzeerd tot ${new Date(state.pausedUntil).toLocaleString("nl-BE")}`
                : "Er worden geen mails verstuurd tot je dit heractiveert."}
          </p>
          {error && (
            <p className="text-xs text-danger mt-1">{error}</p>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={toggle}
        className={cn(
          "px-3 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-60",
          enabled
            ? "bg-foreground text-white hover:bg-slate-700"
            : "bg-success text-white hover:bg-green-500",
        )}
      >
        {pending ? "..." : enabled ? "Pauzeer" : "Heractiveer"}
      </button>
    </div>
  );
}
