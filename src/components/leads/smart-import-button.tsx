"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SmartImportButton() {
  const router = useRouter();
  const [available, setAvailable] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; duplicates: number } | null>(null);

  useEffect(() => {
    fetch("/api/leads/smart-import")
      .then((res) => res.json())
      .then((data) => setAvailable(data.available ?? 0))
      .catch(() => setAvailable(0));
  }, []);

  async function handleImport() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/leads/smart-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 20 }),
      });
      const data = await res.json();
      setResult({ imported: data.imported, duplicates: data.duplicates });
      setAvailable((prev) => (prev !== null ? Math.max(0, prev - data.imported) : 0));
      router.refresh();
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="primary"
        size="sm"
        onClick={handleImport}
        disabled={loading || available === 0}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        {loading ? "Importeren..." : "Voeg 20 leads toe"}
      </Button>
      {available !== null && (
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          <Database className="h-3 w-3" />
          {available.toLocaleString("nl-BE")} beschikbaar
        </span>
      )}
      {result && (
        <span className="text-xs text-green-600">
          +{result.imported} nieuw, {result.duplicates} bestaand
        </span>
      )}
    </div>
  );
}
