"use client";

import Link from "next/link";
import {
  Calendar,
  Clock,
  FileText,
  Phone,
  Flame,
  ArrowRight,
} from "lucide-react";
import type { PipelineLeadRow } from "./pipeline-tabs";
import { urgencyScore } from "@/lib/pipeline/urgency-score";
import { daysBetween } from "@/lib/pipeline/days-in-stage";
import { StaleBadge } from "./stale-badge";

interface TodayViewProps {
  leads: PipelineLeadRow[];
}

type Reason = {
  icon: React.ReactNode;
  label: string;
  tone: "red" | "amber" | "blue" | "orange";
};

function reasonFor(lead: PipelineLeadRow): Reason {
  const now = new Date();

  if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) <= now) {
    const overdue = daysBetween(lead.nextFollowUpAt);
    return {
      icon: <Clock className="h-4 w-4" />,
      label: overdue > 0 ? `Follow-up ${overdue}d te laat` : "Follow-up vandaag",
      tone: "red",
    };
  }

  if (lead.stage === "meeting" && lead.meetingAt) {
    const m = new Date(lead.meetingAt);
    const sameDay =
      m.getFullYear() === now.getFullYear() &&
      m.getMonth() === now.getMonth() &&
      m.getDate() === now.getDate();
    if (sameDay) {
      const time = m.toLocaleTimeString("nl-BE", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return {
        icon: <Calendar className="h-4 w-4" />,
        label: `Afspraak vandaag ${time}`,
        tone: "blue",
      };
    }
  }

  if (lead.stage === "quote_sent") {
    const days = daysBetween(lead.stageChangedAt);
    if (days > 7) {
      return {
        icon: <FileText className="h-4 w-4" />,
        label: `Offerte ${days}d geleden · follow-up tijd`,
        tone: "orange",
      };
    }
  }

  if (lead.stage === "contacted" && daysBetween(lead.lastOutreachAt) > 3) {
    return {
      icon: <Phone className="h-4 w-4" />,
      label: "Hot lead · opnieuw contact",
      tone: "amber",
    };
  }

  return {
    icon: <Flame className="h-4 w-4" />,
    label: "Actie vereist",
    tone: "orange",
  };
}

const TONE_STYLES: Record<Reason["tone"], string> = {
  red: "bg-red-50 border-red-200 text-red-800",
  amber: "bg-amber-50 border-amber-200 text-amber-800",
  blue: "bg-blue-50 border-blue-200 text-blue-800",
  orange: "bg-orange-50 border-orange-200 text-orange-800",
};

export function TodayView({ leads }: TodayViewProps) {
  const ranked = leads
    .map((lead) => ({ lead, score: urgencyScore(lead) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  if (ranked.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-card-border bg-gray-50/50 p-12 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <Calendar className="h-6 w-6 text-green-700" />
        </div>
        <p className="text-sm font-semibold text-foreground">
          Geen urgente acties vandaag
        </p>
        <p className="mt-1 text-xs text-muted">
          Niemand is te laat, geen afspraken staan gepland, geen hot leads wachten.
          Tijd om nieuwe leads te benaderen vanuit{" "}
          <Link href="/warm" className="text-accent hover:underline">
            Warm Leads
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-2">
      <p className="text-xs font-medium text-muted mb-3">
        {ranked.length} lead{ranked.length === 1 ? "" : "s"} hebben vandaag aandacht nodig
      </p>
      {ranked.map(({ lead }, idx) => {
        const reason = reasonFor(lead);
        return (
          <Link
            key={lead.pipelineId}
            href={`/leads/${lead.businessId}`}
            className="group flex items-center gap-3 rounded-xl border border-card-border bg-white p-3 transition-all hover:border-accent/40 hover:shadow-sm"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-muted">
              {idx + 1}
            </div>
            <div
              className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${TONE_STYLES[reason.tone]}`}
            >
              {reason.icon}
              {reason.label}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {lead.name}
              </p>
              <p className="truncate text-xs text-muted">
                {lead.city ?? "—"}
                {lead.sector && ` · ${lead.sector}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {lead.dealValue && lead.dealValue > 0 && (
                <span className="text-xs font-semibold text-foreground">
                  €{lead.dealValue.toLocaleString("nl-BE")}
                </span>
              )}
              <StaleBadge stageChangedAt={lead.stageChangedAt} />
              <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
