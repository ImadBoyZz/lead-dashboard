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
import { ALL_SECTORS } from "@/lib/places-discovery";
import { useRef } from "react";

interface LeadFiltersProps {
  filters: {
    country?: string;
    province?: string;
    status?: string;
    sector?: string;
    search?: string;
    naceCode?: string;
    hasWebsite?: string;
    imported?: string;
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
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <Select
          options={[
            { value: "", label: "Alle sectoren" },
            ...ALL_SECTORS.map((s) => ({ value: s.value, label: s.label })),
          ]}
          value={filters.sector ?? ""}
          onChange={(e) => updateFilter("sector", e.target.value)}
        />
        <Select
          options={[
            { value: "", label: "Website filter" },
            { value: "true", label: "Heeft website" },
            { value: "false", label: "Geen website" },
          ]}
          value={filters.hasWebsite ?? ""}
          onChange={(e) => updateFilter("hasWebsite", e.target.value)}
        />
        <Select
          options={[
            { value: "", label: "Alle imports" },
            { value: "today", label: "Vandaag" },
            { value: "week", label: "Deze week" },
            { value: "month", label: "Deze maand" },
            { value: "older", label: "Ouder dan 1 maand" },
          ]}
          value={filters.imported ?? ""}
          onChange={(e) => updateFilter("imported", e.target.value)}
        />
        <Select
          options={SORT_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
          value={filters.sort ?? "recent"}
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
