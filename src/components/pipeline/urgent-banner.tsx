"use client";

import Link from "next/link";
import { AlertTriangle, Phone, Bell, Clock, ChevronRight } from "lucide-react";
import type { UrgentLead } from "@/lib/pipeline-logic";

interface UrgentBannerProps {
  leads: UrgentLead[];
}

export function UrgentBanner({ leads }: UrgentBannerProps) {
  if (leads.length === 0) return null;

  const overdueCount = leads.filter(
    (l) => new Date(l.dueDate).getTime() < new Date().setHours(0, 0, 0, 0)
  ).length;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2.5">
      <div className="flex items-center gap-6 overflow-x-auto">
        {/* Summary */}
        <div className="flex items-center gap-2 shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-900">
            {leads.length} actie{leads.length !== 1 ? "s" : ""} vandaag
          </span>
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              <Clock className="h-2.5 w-2.5" />
              {overdueCount} achterstallig
            </span>
          )}
        </div>

        {/* Compact lead chips */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {leads.map((lead) => {
            const isOverdue =
              new Date(lead.dueDate).getTime() <
              new Date().setHours(0, 0, 0, 0);

            return (
              <Link
                key={lead.businessId}
                href={`/leads/${lead.businessId}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all shrink-0 ${
                  isOverdue
                    ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
                    : "border-amber-200 bg-white text-amber-900 hover:bg-amber-50"
                }`}
              >
                {lead.urgencyType === "follow_up" ? (
                  <Phone className="h-3 w-3" />
                ) : (
                  <Bell className="h-3 w-3" />
                )}
                <span className="truncate max-w-[120px]">
                  {lead.businessName}
                </span>
                <ChevronRight className="h-3 w-3 opacity-40" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
