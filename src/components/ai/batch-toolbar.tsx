"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLeadSelection } from "@/components/leads/leads-selection-provider";

export function BatchToolbar() {
  const { selectedIds, count, clearAll } = useLeadSelection();
  const router = useRouter();
  const [channel, setChannel] = useState<"email" | "phone">("email");
  const [loading, setLoading] = useState(false);

  if (count === 0) return null;

  async function handleGenerate() {
    setLoading(true);

    try {
      const res = await fetch("/api/ai/generate/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessIds: Array.from(selectedIds),
          channel,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Batch generatie mislukt");
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
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as "email" | "phone")}
            className="rounded-lg border border-card-border bg-white px-3 py-1.5 text-sm"
          >
            <option value="email">Email</option>
            <option value="phone">Telefoon</option>
          </select>

          <Button
            variant="primary"
            size="sm"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {loading ? "Genereren..." : "Genereer Outreach"}
          </Button>
        </div>
      </div>
    </div>
  );
}
