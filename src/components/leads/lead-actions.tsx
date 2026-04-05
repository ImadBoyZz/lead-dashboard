"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";

interface LeadActionsProps {
  leadId: string;
  temperature: string;
}

export function LeadActions({ leadId, temperature }: LeadActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<"warm" | "blacklist" | null>(null);

  async function handleWarm() {
    if (loading) return;
    setLoading("warm");
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadTemperature: "warm" }),
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

  if (temperature === "warm") {
    return <span className="text-xs text-green-600 font-medium">Warm</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleWarm}
        disabled={loading !== null}
        className="rounded-full p-1.5 text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
        title="Markeer als warm lead"
      >
        {loading === "warm" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
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
