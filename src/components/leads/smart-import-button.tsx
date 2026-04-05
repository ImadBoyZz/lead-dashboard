"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Download, MapPin, Star, Globe, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PreviewLead {
  placeId: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  googleMapsUri: string | null;
  hasWebsite: boolean;
  qualityScore: number;
}

const SECTOR_OPTIONS = [
  { value: "beauty", label: "Beauty & Wellness" },
  { value: "horeca", label: "Horeca" },
  { value: "bouw", label: "Bouw & Ambacht" },
  { value: "auto", label: "Auto" },
  { value: "medisch", label: "Medisch" },
  { value: "vastgoed", label: "Vastgoed" },
  { value: "retail", label: "Retail" },
  { value: "fitness", label: "Fitness" },
  { value: "events", label: "Events" },
  { value: "huisdieren", label: "Huisdieren" },
  { value: "transport", label: "Transport" },
  { value: "onderwijs", label: "Onderwijs" },
];

export function SmartImportButton() {
  const router = useRouter();
  const [sector, setSector] = useState("");
  const [city, setCity] = useState("");
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<PreviewLead[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ imported: number; duplicates: number } | null>(null);
  const [alreadyImported, setAlreadyImported] = useState(0);

  async function handleSearch() {
    if (!sector || !city.trim()) return;
    setSearching(true);
    setPreview(null);
    setResult(null);
    setSelected(new Set());

    try {
      const res = await fetch(
        `/api/leads/smart-import?sector=${encodeURIComponent(sector)}&city=${encodeURIComponent(city.trim())}`
      );
      const data = await res.json();
      setPreview(data.leads ?? []);
      setAlreadyImported(data.alreadyImported ?? 0);
      // Select all by default
      setSelected(new Set((data.leads ?? []).map((l: PreviewLead) => l.placeId)));
    } catch {
      setPreview([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleImport() {
    if (!sector || !city.trim() || selected.size === 0) return;
    setImporting(true);
    setResult(null);

    try {
      const res = await fetch("/api/leads/smart-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sector,
          city: city.trim(),
          selectedPlaceIds: Array.from(selected),
          count: selected.size,
        }),
      });
      const data = await res.json();
      setResult({ imported: data.imported, duplicates: data.duplicates });
      setPreview(null);
      router.refresh();
    } catch {
      setResult(null);
    } finally {
      setImporting(false);
    }
  }

  function toggleSelect(placeId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  }

  function toggleAll() {
    if (!preview) return;
    if (selected.size === preview.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(preview.map((l) => l.placeId)));
    }
  }

  return (
    <div className="space-y-4">
      {/* Search form */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Sector</label>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Kies sector...</option>
            {SECTOR_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Stad</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="bv. Aalst, Gent, Antwerpen"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={handleSearch}
          disabled={searching || !sector || !city.trim()}
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {searching ? "Zoeken..." : "Zoek leads"}
        </Button>
      </div>

      {/* Results */}
      {result && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          +{result.imported} leads geïmporteerd, {result.duplicates} al bestaand
        </div>
      )}

      {/* Preview */}
      {preview !== null && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted">
              {preview.length} nieuwe leads gevonden
              {alreadyImported > 0 && (
                <span className="ml-1 text-xs">({alreadyImported} al geïmporteerd)</span>
              )}
            </div>
            {preview.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleAll}
                  className="text-xs text-accent hover:underline"
                >
                  {selected.size === preview.length ? "Deselecteer alles" : "Selecteer alles"}
                </button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleImport}
                  disabled={importing || selected.size === 0}
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {importing
                    ? "Importeren..."
                    : `Importeer ${selected.size} leads`}
                </Button>
              </div>
            )}
          </div>

          {preview.length === 0 ? (
            <p className="text-sm text-muted">
              Geen nieuwe leads gevonden voor deze zoekopdracht.
            </p>
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {preview.map((lead) => (
                <label
                  key={lead.placeId}
                  className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(lead.placeId)}
                    onChange={() => toggleSelect(lead.placeId)}
                    className="mt-1 rounded border-border"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {lead.name}
                      </span>
                      <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                        {lead.qualityScore}pt
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {lead.address}
                      </span>
                      {lead.rating !== null && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-500" />
                          {lead.rating} ({lead.reviewCount} reviews)
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {lead.hasWebsite ? "Heeft website" : "Geen website"}
                      </span>
                      {lead.googleMapsUri && (
                        <a
                          href={lead.googleMapsUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-accent hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Maps
                        </a>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
