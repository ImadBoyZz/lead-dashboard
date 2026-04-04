"use client";

import { useRouter, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  LEAD_STATUS_OPTIONS,
  COUNTRY_OPTIONS,
  BELGIAN_PROVINCES,
  DUTCH_PROVINCES,
  SORT_OPTIONS,
} from "@/lib/constants";
import { useRef } from "react";

interface LeadFiltersProps {
  filters: {
    country?: string;
    province?: string;
    status?: string;
    scoreMin?: string;
    scoreMax?: string;
    search?: string;
    naceCode?: string;
    hasWebsite?: string;
    sort?: string;
    order?: string;
  };
}

export function LeadFilters({ filters }: LeadFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement>(null);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams();
    // Preserve existing filters
    for (const [k, v] of Object.entries(filters)) {
      if (v && k !== "page") params.set(k, v);
    }
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    // Reset to page 1 when filters change
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearFilters() {
    router.push(pathname);
  }

  const provinces =
    filters.country === "NL"
      ? DUTCH_PROVINCES
      : BELGIAN_PROVINCES;

  const hasActiveFilters = Object.entries(filters).some(
    ([key, value]) => value && key !== "page" && key !== "sort" && key !== "order"
  );

  return (
    <div className="space-y-3 mb-6">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Zoek op naam of stad..."
            defaultValue={filters.search ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateFilter("search", (e.target as HTMLInputElement).value);
              }
            }}
            className="w-full rounded-lg border border-input-border bg-white pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>
        <Select
          options={[
            { value: "", label: "Alle landen" },
            ...COUNTRY_OPTIONS.map((c) => ({ value: c.value, label: c.label })),
          ]}
          value={filters.country ?? ""}
          onChange={(e) => {
            updateFilter("country", e.target.value);
            // Clear province when country changes
            if (!e.target.value) updateFilter("province", "");
          }}
        />
        <Select
          options={[
            { value: "", label: "Alle provincies" },
            ...provinces.map((p) => ({ value: p, label: p })),
          ]}
          value={filters.province ?? ""}
          onChange={(e) => updateFilter("province", e.target.value)}
        />
        <Select
          options={[
            { value: "", label: "Alle statussen" },
            ...LEAD_STATUS_OPTIONS.map((s) => ({
              value: s.value,
              label: s.label,
            })),
          ]}
          value={filters.status ?? ""}
          onChange={(e) => updateFilter("status", e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <Select
          options={[
            { value: "", label: "Website filter" },
            { value: "true", label: "Heeft website" },
            { value: "false", label: "Geen website" },
          ]}
          value={filters.hasWebsite ?? ""}
          onChange={(e) => updateFilter("hasWebsite", e.target.value)}
        />
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            placeholder="Min score"
            defaultValue={filters.scoreMin ?? ""}
            min={0}
            max={100}
            onBlur={(e) => updateFilter("scoreMin", e.target.value)}
            className="w-24 rounded-lg border border-input-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <span className="text-muted text-sm">-</span>
          <input
            type="number"
            placeholder="Max score"
            defaultValue={filters.scoreMax ?? ""}
            min={0}
            max={100}
            onBlur={(e) => updateFilter("scoreMax", e.target.value)}
            className="w-24 rounded-lg border border-input-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>
        <Select
          options={SORT_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
          value={filters.sort ?? "score"}
          onChange={(e) => updateFilter("sort", e.target.value)}
        />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Filters wissen
          </Button>
        )}
      </div>
    </div>
  );
}
