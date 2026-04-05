"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2, Loader2, Ban, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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

function UnblacklistButton({ leadId, onDone }: { leadId: string; onDone: () => void }) {
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
      onDone();
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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState(data);

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      (e.city?.toLowerCase().includes(q) ?? false) ||
      (e.sector?.toLowerCase().includes(q) ?? false)
    );
  });

  function handleRestored(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Ban className="h-4 w-4" />
        Blacklist ({entries.length})
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-2xl max-h-[80vh] bg-card border border-card-border rounded-xl shadow-2xl flex flex-col mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-card-border">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Blacklist</h2>
                <p className="text-xs text-muted mt-0.5">
                  {entries.length} geblokkeerde leads
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search */}
            <div className="px-6 py-3 border-b border-card-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="text"
                  placeholder="Zoek op naam, stad of sector..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                  autoFocus
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-6 py-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted py-8 text-center">
                  {entries.length === 0
                    ? "Geen geblokkeerde leads"
                    : "Geen resultaten gevonden"}
                </p>
              ) : (
                <div className="divide-y divide-card-border">
                  {filtered.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {entry.name}
                        </p>
                        <p className="text-xs text-muted">
                          {entry.sector ? (
                            <span className="capitalize">{entry.sector}</span>
                          ) : null}
                          {entry.sector && entry.city ? " · " : ""}
                          {entry.city ?? ""}
                          {(entry.sector || entry.city) && entry.blacklistedAt ? " · " : ""}
                          {formatDate(entry.blacklistedAt)}
                        </p>
                      </div>
                      <UnblacklistButton
                        leadId={entry.id}
                        onDone={() => handleRestored(entry.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
