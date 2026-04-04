"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scan, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface ScanButtonProps {
  businessId: string;
  hasWebsite: boolean;
}

export function ScanButton({ businessId, hasWebsite }: ScanButtonProps) {
  const [status, setStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [result, setResult] = useState<{ score?: number; error?: string } | null>(null);
  const router = useRouter();

  const handleScan = async () => {
    if (!hasWebsite) return;
    setStatus("scanning");
    setResult(null);

    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });

      const data = await res.json();

      if (data.success) {
        setStatus("success");
        setResult({ score: data.score });
        // Refresh the page to show updated audit data
        setTimeout(() => router.refresh(), 1500);
      } else {
        setStatus("error");
        setResult({ error: data.error || "Scan mislukt" });
      }
    } catch (e) {
      setStatus("error");
      setResult({ error: "Netwerkfout bij scannen" });
    }
  };

  if (!hasWebsite) {
    return (
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed"
      >
        <Scan className="w-4 h-4" />
        Geen website om te scannen
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleScan}
        disabled={status === "scanning"}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
          status === "scanning"
            ? "bg-accent/10 text-accent cursor-wait"
            : status === "success"
            ? "bg-green-50 text-green-700"
            : status === "error"
            ? "bg-red-50 text-red-700"
            : "bg-accent text-white hover:bg-accent/90"
        }`}
      >
        {status === "scanning" && <Loader2 className="w-4 h-4 animate-spin" />}
        {status === "success" && <CheckCircle2 className="w-4 h-4" />}
        {status === "error" && <XCircle className="w-4 h-4" />}
        {status === "idle" && <Scan className="w-4 h-4" />}
        {status === "scanning"
          ? "Website scannen... (30-60s)"
          : status === "success"
          ? `Score: ${result?.score}/100`
          : status === "error"
          ? "Scan mislukt"
          : "Website scannen"}
      </button>
      {status === "error" && result?.error && (
        <p className="text-xs text-red-500">{result.error}</p>
      )}
      {status === "success" && (
        <p className="text-xs text-green-600">Pagina wordt vernieuwd...</p>
      )}
    </div>
  );
}
