"use client";

import { useRouter, usePathname } from "next/navigation";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BELGIAN_PROVINCES } from "@/lib/constants";
import { ALL_SECTORS } from "@/lib/places-discovery";
import { Search } from "lucide-react";
import { useRef } from "react";

interface WarmLeadFiltersProps {
  filters: {
    sector?: string;
    status?: string;
    hasWebsite?: string;
    province?: string;
    search?: string;
  };
}

export function WarmLeadFilters({ filters }: WarmLeadFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement>(null);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    updateFilter("search", searchRef.current?.value ?? "");
  }

  function clearFilters() {
    router.push(pathname);
  }

  const hasActiveFilters = Object.values(filters).some((v) => v);

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            ref={searchRef}
            defaultValue={filters.search ?? ""}
            placeholder="Zoek op naam of stad..."
            className="pl-9 w-56"
          />
        </form>
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
            { value: "", label: "Alle omgevingen" },
            ...BELGIAN_PROVINCES.map((p) => ({ value: p, label: p })),
          ]}
          value={filters.province ?? ""}
          onChange={(e) => updateFilter("province", e.target.value)}
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
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Filters wissen
          </Button>
        )}
      </div>
    </div>
  );
}
