"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2, X, Loader2 } from "lucide-react";

export function WarmLeadActions({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"cold" | "blacklist" | null>(null);

  async function handleCold() {
    if (loading) return;
    setLoading("cold");
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadTemperature: "cold" }),
      });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function handleBlacklist() {
    if (loading) return;
    setLoading("blacklist");
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blacklisted: true }),
      });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleCold}
        disabled={loading !== null}
        className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50"
        title="Terug naar cold leads"
      >
        {loading === "cold" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Undo2 className="h-4 w-4" />
        )}
      </button>
      <button
        onClick={handleBlacklist}
        disabled={loading !== null}
        className="rounded-full p-1.5 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
        title="Verwijder lead (blacklist)"
      >
        {loading === "blacklist" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <X className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
