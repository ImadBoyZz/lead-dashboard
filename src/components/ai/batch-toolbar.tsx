"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLeadSelection } from "@/components/leads/leads-selection-provider";

interface BatchToolbarProps {
  showScan?: boolean;
  idsWithEmail?: string[];
  idsWithWebsite?: string[];
}

export function BatchToolbar({ showScan = false, idsWithEmail, idsWithWebsite }: BatchToolbarProps) {
  const { selectedIds, count, clearAll } = useLeadSelection();
  const router = useRouter();
  const channel = "email" as const;
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });

  if (count === 0) return null;

  const emailSet = new Set(idsWithEmail ?? []);
  const websiteSet = new Set(idsWithWebsite ?? []);
  const selectedWithEmail = Array.from(selectedIds).filter((id) => emailSet.has(id));
  const selectedWithWebsite = Array.from(selectedIds).filter((id) => websiteSet.has(id));
  const canGenerate = selectedWithEmail.length > 0;
  const canScan = selectedWithWebsite.length > 0;

  async function handleGenerate() {
    if (!canGenerate) return;
    setLoading(true);

    try {
      const res = await fetch("/api/ai/generate/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessIds: selectedWithEmail,
          channel,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        const details = data.details?.formErrors?.length
          ? `: ${data.details.formErrors.join(', ')}`
          : '';
        alert((data.error ?? "Batch generatie mislukt") + details);
        return;
      }

      const data = await res.json();
      clearAll();
      router.push(`/leads/batch/${data.campaignId}`);
    } catch {
      alert("Er is een fout opgetreden");
    } finally {
      setLoading(false);
    }
  }

  async function handleBatchScan() {
    if (!canScan) return;
    const ids = selectedWithWebsite;
    setScanning(true);
    setScanProgress({ done: 0, total: ids.length });

    let scanned = 0;
    for (const businessId of ids) {
      try {
        await fetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId }),
        });
      } catch {
        // Ga door met de volgende
      }
      scanned++;
      setScanProgress({ done: scanned, total: ids.length });
    }

    setScanning(false);
    router.refresh();
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-card-border shadow-lg animate-in slide-in-from-bottom-2">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            {count} lead{count !== 1 ? "s" : ""} geselecteerd
          </span>
          <button
            onClick={clearAll}
            className="text-xs text-muted hover:text-foreground underline"
          >
            Deselecteer alles
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBatchScan}
            disabled={scanning || loading || !canScan}
          >
            {scanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Scan className="h-4 w-4" />
            )}
            {scanning
              ? `Scannen... (${scanProgress.done}/${scanProgress.total})`
              : canScan
              ? `Scan Websites (${selectedWithWebsite.length})`
              : "Geen websites"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleGenerate}
            disabled={loading || scanning || !canGenerate}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {loading
              ? "Genereren..."
              : canGenerate
              ? `Genereer Outreach (${selectedWithEmail.length})`
              : "Geen leads met email"}
          </Button>
        </div>
      </div>
    </div>
  );
}
