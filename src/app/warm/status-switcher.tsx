"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUS_OPTIONS } from "@/lib/constants";

interface StatusSwitcherProps {
  leadId: string;
  currentStatus: string | undefined;
}

export function StatusSwitcher({ leadId, currentStatus }: StatusSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const statusOpt = LEAD_STATUS_OPTIONS.find((s) => s.value === currentStatus);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  async function handleSelect(newStatus: string) {
    if (newStatus === currentStatus) {
      setOpen(false);
      return;
    }
    setOpen(false);
    setLoading(true);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted" />;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="cursor-pointer transition-opacity hover:opacity-80"
      >
        {statusOpt ? (
          <span className={"inline-flex items-center rounded-full text-xs font-medium px-2.5 py-0.5 " + statusOpt.color}>
            {statusOpt.label}
          </span>
        ) : (
          <Badge>Nieuw</Badge>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 min-w-[160px] rounded-lg border border-card-border bg-white shadow-lg py-1">
          {LEAD_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={
                "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50" +
                (opt.value === (currentStatus ?? "new") ? " bg-gray-50 font-medium" : "")
              }
            >
              <span className={"inline-block h-2 w-2 rounded-full " + opt.color.split(" ")[0]} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
