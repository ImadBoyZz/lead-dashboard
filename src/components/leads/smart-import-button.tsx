"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Download, MapPin, Star, Globe, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALL_SECTORS } from "@/lib/places-discovery";
import { PROVINCE_NAMES, parseProvinceValue, PROVINCE_CITIES } from "@/lib/regions";

interface PreviewLead {
  placeId: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string;
  photosCount: number;
  googleMapsUri: string | null;
  hasWebsite: boolean;
  qualityScore: number;
  chainWarning: string | null;
  discoveredInCity: string;  // welke stad leverde deze lead op
}

interface SearchProgress {
  mode: 'city' | 'province';
  currentCity: string | null;
  completedCities: number;
  totalCities: number;
  failedCities: string[];
  exhausted: boolean;  // true als alle steden doorzocht zijn maar target niet gehaald
}


const TARGET_OPTIONS = [
  { value: 50,  label: "~50 leads" },
  { value: 75,  label: "~75 leads" },
  { value: 125, label: "~125 leads" },
  { value: 200, label: "~200 leads" },
];

export function SmartImportButton() {
  const router = useRouter();
  const [sector, setSector] = useState("");
  const [city, setCity] = useState("");
  const [target, setTarget] = useState(50);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<PreviewLead[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ imported: number; duplicates: number } | null>(null);
  const [progress, setProgress] = useState<SearchProgress | null>(null);


  async function handleSearch() {
    if (!sector || !city) return;
    setSearching(true);
    setPreview(null);
    setResult(null);
    setSelected(new Set());

    const provinceName = parseProvinceValue(city);
    const cities = provinceName ? [...PROVINCE_CITIES[provinceName]] : [city];
    const isProvince = provinceName !== null;

    setProgress({
      mode: isProvince ? 'province' : 'city',
      currentCity: cities[0] ?? null,
      completedCities: 0,
      totalCities: cities.length,
      failedCities: [],
      exhausted: false,
    });

    const accumulated: PreviewLead[] = [];
    const seenPlaceIds = new Set<string>();
    const failed: string[] = [];

    try {
      for (let i = 0; i < cities.length; i++) {
        const currentCity = cities[i];
        if (accumulated.length >= target) break;

        setProgress((p) => (p ? { ...p, currentCity, completedCities: i } : p));

        const remaining = target - accumulated.length;
        try {
          const res = await fetch(
            `/api/leads/smart-import?sector=${encodeURIComponent(sector)}&city=${encodeURIComponent(currentCity)}&target=${remaining}`
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          for (const lead of (data.leads ?? []) as Omit<PreviewLead, "discoveredInCity">[]) {
            if (!seenPlaceIds.has(lead.placeId)) {
              seenPlaceIds.add(lead.placeId);
              accumulated.push({ ...lead, discoveredInCity: currentCity });
            }
          }
        } catch (err) {
          console.error(`[Search] Stad ${currentCity} mislukt:`, err);
          failed.push(currentCity);
        }
      }

      const fullyExhausted = accumulated.length < target && failed.length === 0;
      setProgress((p) =>
        p
          ? {
              ...p,
              completedCities: cities.length,
              currentCity: null,
              failedCities: failed,
              exhausted: fullyExhausted,
            }
          : p
      );
      setPreview(accumulated);
      setSelected(new Set(accumulated.map((l) => l.placeId)));
    } finally {
      setSearching(false);
    }
  }

  async function handleImport() {
    if (!sector || selected.size === 0 || !preview) return;
    setImporting(true);
    setResult(null);

    const selectedLeads = preview.filter((l) => selected.has(l.placeId));

    try {
      const res = await fetch("/api/leads/smart-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sector,
          leads: selectedLeads,
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
            {ALL_SECTORS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Stad / Regio</label>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Kies stad...</option>
            <optgroup label="Hele provincie (alle steden)">
              {PROVINCE_NAMES.map((p) => (
                <option key={p} value={`province:${p}`}>
                  {p} — alle steden
                </option>
              ))}
            </optgroup>
            <optgroup label="Oost-Vlaanderen">
              <option value="Gent">Gent & omgeving</option>
              <option value="Aalst">Aalst & omgeving</option>
              <option value="Sint-Niklaas">Sint-Niklaas & omgeving</option>
              <option value="Dendermonde">Dendermonde & omgeving</option>
              <option value="Oudenaarde">Oudenaarde & omgeving</option>
              <option value="Wetteren">Wetteren & omgeving</option>
              <option value="Lokeren">Lokeren & omgeving</option>
              <option value="Eeklo">Eeklo & omgeving</option>
              <option value="Geraardsbergen">Geraardsbergen & omgeving</option>
              <option value="Zele">Zele & omgeving</option>
            </optgroup>
            <optgroup label="Antwerpen">
              <option value="Antwerpen">Antwerpen & omgeving</option>
              <option value="Mechelen">Mechelen & omgeving</option>
              <option value="Turnhout">Turnhout & omgeving</option>
              <option value="Lier">Lier & omgeving</option>
              <option value="Herentals">Herentals & omgeving</option>
              <option value="Mol">Mol & omgeving</option>
              <option value="Boom">Boom & omgeving</option>
              <option value="Brasschaat">Brasschaat & omgeving</option>
            </optgroup>
            <optgroup label="Vlaams-Brabant">
              <option value="Leuven">Leuven & omgeving</option>
              <option value="Vilvoorde">Vilvoorde & omgeving</option>
              <option value="Halle">Halle & omgeving</option>
              <option value="Aarschot">Aarschot & omgeving</option>
              <option value="Tienen">Tienen & omgeving</option>
              <option value="Diest">Diest & omgeving</option>
            </optgroup>
            <optgroup label="West-Vlaanderen">
              <option value="Brugge">Brugge & omgeving</option>
              <option value="Kortrijk">Kortrijk & omgeving</option>
              <option value="Oostende">Oostende & omgeving</option>
              <option value="Roeselare">Roeselare & omgeving</option>
              <option value="Ieper">Ieper & omgeving</option>
              <option value="Waregem">Waregem & omgeving</option>
              <option value="Knokke-Heist">Knokke-Heist & omgeving</option>
            </optgroup>
            <optgroup label="Limburg">
              <option value="Hasselt">Hasselt & omgeving</option>
              <option value="Genk">Genk & omgeving</option>
              <option value="Sint-Truiden">Sint-Truiden & omgeving</option>
              <option value="Tongeren">Tongeren & omgeving</option>
              <option value="Beringen">Beringen & omgeving</option>
              <option value="Lommel">Lommel & omgeving</option>
            </optgroup>
            <optgroup label="Brussel">
              <option value="Brussel">Brussel & omgeving</option>
            </optgroup>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Aantal leads</label>
          <select
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {TARGET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={handleSearch}
          disabled={searching || !sector || !city}
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {searching
            ? progress?.mode === "province" && progress.currentCity
              ? `Zoeken in ${progress.currentCity}... (${progress.completedCities + 1}/${progress.totalCities})`
              : "Zoeken..."
            : "Zoek leads"}
        </Button>
      </div>

      {/* Results */}
      {result && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          +{result.imported} leads geïmporteerd, {result.duplicates} al bestaand
        </div>
      )}

      {/* Preview Modal */}
      {preview !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setPreview(null)}
          />
          {/* Modal */}
          <div className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-lg border border-border bg-card shadow-2xl mx-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">
                  {preview.length} leads gevonden
                  {progress?.exhausted && progress.mode === "province" && (
                    <span className="ml-2 text-xs font-normal text-muted">
                      — provincie uitgeput, alle steden doorzocht
                    </span>
                  )}
                </div>
                {progress?.failedCities.length ? (
                  <div className="text-xs text-orange-700">
                    {progress.failedCities.length} stad/steden mislukt: {progress.failedCities.join(", ")}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                {preview.length > 0 && (
                  <>
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
                  </>
                )}
                <button
                  onClick={() => setPreview(null)}
                  className="rounded-md p-1 text-muted hover:bg-muted/20 hover:text-foreground transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1">
              {preview.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted text-center">
                  Geen nieuwe leads gevonden voor deze zoekopdracht.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {preview.map((lead) => (
                    <label
                      key={lead.placeId}
                      className="flex cursor-pointer items-start gap-3 px-5 py-3 hover:bg-muted/30 transition-colors"
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
                          {lead.chainWarning && (
                            <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                              ⚠ {lead.chainWarning}
                            </span>
                          )}
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
          </div>
        </div>
      )}
    </div>
  );
}
