"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, X, Loader2, Undo2 } from "lucide-react";

interface Props {
  leadId: string;
  temperature: string;
}

export function DetailLeadActions({ leadId, temperature }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleAction(action: "warm" | "cold" | "blacklist") {
    if (loading) return;
    setLoading(action);
    try {
      const body =
        action === "warm"
          ? { leadTemperature: "warm" }
          : action === "cold"
            ? { leadTemperature: "cold" }
            : { blacklisted: true };

      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (action === "blacklist") {
        router.push("/leads");
      } else {
        router.refresh();
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {temperature === "cold" ? (
        <button
          onClick={() => handleAction("warm")}
          disabled={loading !== null}
          className="flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
        >
          {loading === "warm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
          Doorsturen naar Warm Leads
        </button>
      ) : (
        <button
          onClick={() => handleAction("cold")}
          disabled={loading !== null}
          className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          {loading === "cold" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
          Terug naar Cold Leads
        </button>
      )}
      <button
        onClick={() => handleAction("blacklist")}
        disabled={loading !== null}
        className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
      >
        {loading === "blacklist" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        Blacklist (nooit meer tonen)
      </button>
    </div>
  );
}
