"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { TriageCard, type TriageLead } from "./triage-card";
import { UndoToast } from "./undo-toast";

type TriageAction = "promote" | "blacklist" | "skip";

interface UndoEntry {
  leadId: string;
  action: TriageAction;
  leadName: string;
  timestamp: number;
}

interface TriageWorkspaceProps {
  initialQueue: TriageLead[];
  backUrl: string;
  queueLimitReached: boolean;
}

export function TriageWorkspace({ initialQueue, backUrl, queueLimitReached }: TriageWorkspaceProps) {
  const router = useRouter();
  const [queue] = useState<TriageLead[]>(initialQueue);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState({ promoted: 0, blacklisted: 0, skipped: 0 });
  const [lastAction, setLastAction] = useState<UndoEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const total = queue.length;
  const currentLead = queue[currentIndex];
  const isDone = currentIndex >= total;

  const applyAction = useCallback(
    async (action: TriageAction) => {
      if (busy || isDone || !currentLead) return;
      setBusy(true);

      // Optimistic advance: UI gaat direct door, fetch vuurt op de achtergrond
      const lead = currentLead;
      setCurrentIndex((i) => i + 1);
      setStats((s) => ({
        promoted: s.promoted + (action === "promote" ? 1 : 0),
        blacklisted: s.blacklisted + (action === "blacklist" ? 1 : 0),
        skipped: s.skipped + (action === "skip" ? 1 : 0),
      }));
      setLastAction({
        leadId: lead.business.id,
        action,
        leadName: lead.business.name,
        timestamp: Date.now(),
      });

      if (action !== "skip") {
        try {
          const body =
            action === "promote"
              ? { leadTemperature: "warm" }
              : { blacklisted: true };
          await fetch(`/api/leads/${lead.business.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } catch (err) {
          console.error("Triage action failed:", err);
        }
      }

      setBusy(false);
    },
    [busy, currentLead, isDone]
  );

  const handleUndo = useCallback(async () => {
    if (!lastAction || busy) return;
    setBusy(true);

    // UI rollback
    setCurrentIndex((i) => Math.max(0, i - 1));
    setStats((s) => ({
      promoted: s.promoted - (lastAction.action === "promote" ? 1 : 0),
      blacklisted: s.blacklisted - (lastAction.action === "blacklist" ? 1 : 0),
      skipped: s.skipped - (lastAction.action === "skip" ? 1 : 0),
    }));

    if (lastAction.action !== "skip") {
      try {
        const body =
          lastAction.action === "promote"
            ? { leadTemperature: "cold" }
            : { blacklisted: false };
        await fetch(`/api/leads/${lastAction.leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (err) {
        console.error("Triage undo failed:", err);
      }
    }

    setLastAction(null);
    setBusy(false);
  }, [lastAction, busy]);

  const handleExit = useCallback(() => {
    router.push(backUrl);
  }, [router, backUrl]);

  // Keyboard handler
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore als focus in een input/textarea zit
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "e":
          e.preventDefault();
          applyAction("promote");
          break;
        case "s":
          e.preventDefault();
          applyAction("skip");
          break;
        case "x":
          e.preventDefault();
          applyAction("blacklist");
          break;
        case "u":
          e.preventDefault();
          handleUndo();
          break;
        case "o":
          e.preventDefault();
          if (currentLead?.business.website) {
            const url = currentLead.business.website.startsWith("http")
              ? currentLead.business.website
              : "https://" + currentLead.business.website;
            window.open(url, "_blank", "noopener,noreferrer");
          }
          break;
        case "escape":
          e.preventDefault();
          handleExit();
          break;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyAction, handleUndo, handleExit, currentLead]);

  // Refresh de /leads tabel bij exit zodat mutations zichtbaar zijn
  useEffect(() => {
    return () => {
      router.refresh();
    };
  }, [router]);

  const progressPct = useMemo(() => {
    if (total === 0) return 0;
    return Math.round((currentIndex / total) * 100);
  }, [currentIndex, total]);

  if (isDone) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <Link
            href={backUrl}
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Terug naar leads
          </Link>
        </div>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500 mb-6" />
          <h1 className="text-2xl font-bold text-foreground mb-2">
            All done!
          </h1>
          <p className="text-sm text-muted mb-8">
            {total} lead{total === 1 ? "" : "s"} verwerkt.
          </p>
          <div className="grid grid-cols-3 gap-8 mb-10">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{stats.promoted}</div>
              <div className="text-xs text-muted mt-1 uppercase tracking-wider">Promoted</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-500">{stats.blacklisted}</div>
              <div className="text-xs text-muted mt-1 uppercase tracking-wider">Blacklisted</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-muted">{stats.skipped}</div>
              <div className="text-xs text-muted mt-1 uppercase tracking-wider">Skipped</div>
            </div>
          </div>
          <Link
            href={backUrl}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Terug naar leads
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-6rem)]">
      {/* Header met progress */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <Link
          href={backUrl}
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar leads
        </Link>
        <div className="flex-1 max-w-md">
          <div className="flex items-center justify-between text-xs text-muted mb-1.5">
            <span className="font-medium">Triage Cold Leads</span>
            <span>
              {currentIndex + 1} / {total}
              {queueLimitReached && "+"}
            </span>
          </div>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <button
          onClick={handleExit}
          className="text-xs text-muted hover:text-foreground transition-colors"
          title="Esc"
        >
          Exit (Esc)
        </button>
      </div>

      {currentLead && (
        <TriageCard
          lead={currentLead}
          onPromote={() => applyAction("promote")}
          onSkip={() => applyAction("skip")}
          onBlacklist={() => applyAction("blacklist")}
          busy={busy}
        />
      )}

      {lastAction && (
        <UndoToast
          action={lastAction.action}
          leadName={lastAction.leadName}
          onUndo={handleUndo}
          onDismiss={() => setLastAction(null)}
          key={lastAction.timestamp}
        />
      )}
    </div>
  );
}
