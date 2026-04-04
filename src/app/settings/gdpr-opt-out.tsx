"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ShieldAlert, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SearchResult {
  id: string;
  name: string;
  city: string | null;
  optOut: boolean;
}

export function GdprOptOut() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [optingOut, setOptingOut] = useState<string | null>(null);
  const [optedOut, setOptedOut] = useState<Set<string>>(new Set());

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(
        "/api/leads?search=" + encodeURIComponent(searchTerm.trim()) + "&limit=10"
      );
      if (res.ok) {
        const data = await res.json();
        setResults(
          data.data.map((item: { id: string; name: string; city: string | null; optOut: boolean }) => ({
            id: item.id,
            name: item.name,
            city: item.city,
            optOut: item.optOut,
          }))
        );
      }
    } catch {
      // Silent fail
    } finally {
      setIsSearching(false);
    }
  }

  async function handleOptOut(id: string) {
    if (optingOut) return;
    setOptingOut(id);

    try {
      const res = await fetch("/api/leads/" + id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optOut: true }),
      });

      if (res.ok) {
        setOptedOut((prev) => new Set([...prev, id]));
        router.refresh();
      }
    } catch {
      // Silent fail
    } finally {
      setOptingOut(null);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Zoek bedrijf op naam..."
            className="w-full rounded-lg border border-input-border bg-white pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>
        <Button type="submit" size="sm" disabled={isSearching}>
          {isSearching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Zoeken
        </Button>
      </form>

      {results.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-card-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-card-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                  Bedrijf
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                  Stad
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wider">
                  Actie
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {results.map((item) => {
                const isOptedOut = item.optOut || optedOut.has(item.id);
                return (
                  <tr key={item.id} className="hover:bg-gray-50/40">
                    <td className="px-4 py-2.5 font-medium">{item.name}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {item.city || "\u2014"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {isOptedOut ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Opted-out
                        </span>
                      ) : (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleOptOut(item.id)}
                          disabled={optingOut === item.id}
                        >
                          {optingOut === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ShieldAlert className="h-3.5 w-3.5" />
                          )}
                          Opt-out
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted">
        Bedrijven die opted-out zijn worden niet meer getoond in de leads lijst.
      </p>
    </div>
  );
}
