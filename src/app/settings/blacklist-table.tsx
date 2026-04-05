"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2, Loader2 } from "lucide-react";

interface BlacklistEntry {
  id: string;
  name: string;
  city: string | null;
  sector: string | null;
  website: string | null;
  blacklistedAt: Date | null;
}

function formatDate(date: Date | string | null) {
  if (!date) return "\u2014";
  return new Date(date).toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function UnblacklistButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRestore() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blacklisted: false, leadTemperature: "cold" }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleRestore}
      disabled={loading}
      className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50"
      title="Herstel naar cold leads"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Undo2 className="h-3.5 w-3.5" />
      )}
      Herstel
    </button>
  );
}

export function BlacklistTable({ data }: { data: BlacklistEntry[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">Geen geblokkeerde leads</p>;
  }

  return (
    <div className="overflow-x-auto -mx-6 -mb-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50/80 border-b border-card-border">
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">Naam</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">Sector</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">Locatie</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">Geblokkeerd op</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {data.map((entry) => (
            <tr key={entry.id} className="hover:bg-gray-50/40">
              <td className="px-4 py-2.5 font-medium">{entry.name}</td>
              <td className="px-4 py-2.5 text-muted capitalize">{entry.sector ?? "\u2014"}</td>
              <td className="px-4 py-2.5 text-muted">{entry.city ?? "\u2014"}</td>
              <td className="px-4 py-2.5 text-muted">{formatDate(entry.blacklistedAt)}</td>
              <td className="px-4 py-2.5">
                <UnblacklistButton leadId={entry.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
