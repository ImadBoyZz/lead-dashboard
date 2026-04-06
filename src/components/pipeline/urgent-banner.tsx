"use client";

import Link from "next/link";
import { AlertTriangle, Phone, Bell, Clock } from "lucide-react";
import type { UrgentLead } from "@/lib/pipeline-logic";
import { PIPELINE_STAGE_OPTIONS } from "@/lib/constants";

interface UrgentBannerProps {
  leads: UrgentLead[];
}

export function UrgentBanner({ leads }: UrgentBannerProps) {
  if (leads.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-900">
          Actie vereist vandaag ({leads.length})
        </h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {leads.map((lead) => {
          const stageConfig = PIPELINE_STAGE_OPTIONS.find(
            (s) => s.value === lead.stage
          );
          const isOverdue =
            new Date(lead.dueDate).getTime() <
            new Date().setHours(0, 0, 0, 0);

          return (
            <Link
              key={lead.businessId}
              href={`/leads/${lead.businessId}`}
              className="flex items-start gap-3 rounded-lg border border-amber-200/60 bg-white p-3 transition-all hover:shadow-sm hover:border-amber-300"
            >
              <div className="mt-0.5">
                {lead.urgencyType === "follow_up" ? (
                  <Phone className="h-3.5 w-3.5 text-amber-600" />
                ) : (
                  <Bell className="h-3.5 w-3.5 text-amber-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {lead.businessName}
                </p>
                <p className="text-xs text-muted truncate">
                  {lead.city ?? "Onbekend"}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  {stageConfig && (
                    <span
                      className={`inline-flex items-center rounded-full text-[10px] font-medium px-1.5 py-0.5 ${stageConfig.color}`}
                    >
                      {stageConfig.label}
                    </span>
                  )}
                  {isOverdue && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600">
                      <Clock className="h-2.5 w-2.5" />
                      Achterstallig
                    </span>
                  )}
                </div>
                {lead.detail && (
                  <p className="text-[11px] text-muted mt-1 truncate">
                    {lead.detail}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
