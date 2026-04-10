"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  CalendarClock,
  List,
  LayoutGrid,
  Euro,
} from "lucide-react";
import { DEFAULT_VIEW, type PipelineView } from "@/lib/pipeline/view";

const VIEWS: Array<{ value: PipelineView; label: string; icon: React.ReactNode }> = [
  { value: "today", label: "Vandaag", icon: <CalendarClock className="h-3.5 w-3.5" /> },
  { value: "list", label: "Lijst", icon: <List className="h-3.5 w-3.5" /> },
  { value: "board", label: "Kanban", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { value: "money", label: "Money", icon: <Euro className="h-3.5 w-3.5" /> },
];

interface Props {
  current: PipelineView;
}

export function PipelineViewSwitcher({ current }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function switchTo(view: PipelineView) {
    const params = new URLSearchParams(searchParams.toString());
    if (view === DEFAULT_VIEW) {
      params.delete("view");
    } else {
      params.set("view", view);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-card-border bg-white p-1 shadow-sm">
      {VIEWS.map((v) => {
        const isActive = current === v.value;
        return (
          <button
            key={v.value}
            onClick={() => switchTo(v.value)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "bg-accent text-white shadow-sm"
                : "text-muted hover:text-foreground hover:bg-gray-50"
            }`}
            type="button"
          >
            {v.icon}
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

