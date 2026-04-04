"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEAD_STATUS_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface StatusChangerProps {
  leadId: string;
  currentStatus: string;
}

export function StatusChanger({ leadId, currentStatus }: StatusChangerProps) {
  const router = useRouter();
  const [optimisticStatus, setOptimisticStatus] = useState(currentStatus);
  const [isLoading, setIsLoading] = useState(false);

  async function handleStatusChange(newStatus: string) {
    if (newStatus === optimisticStatus || isLoading) return;

    setIsLoading(true);
    setOptimisticStatus(newStatus);

    try {
      const res = await fetch("/api/leads/" + leadId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        setOptimisticStatus(currentStatus);
        return;
      }

      router.refresh();
    } catch {
      setOptimisticStatus(currentStatus);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {isLoading && (
        <div className="flex items-center gap-1.5 text-sm text-muted mr-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Opslaan...</span>
        </div>
      )}
      {LEAD_STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => handleStatusChange(opt.value)}
          disabled={isLoading}
          className={cn(
            "inline-flex items-center rounded-full text-xs font-medium px-3 py-1.5 transition-all border",
            optimisticStatus === opt.value
              ? opt.color + " border-current ring-2 ring-current/20"
              : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
