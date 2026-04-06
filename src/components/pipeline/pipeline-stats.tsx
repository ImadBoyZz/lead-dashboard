"use client";

import {
  UserPlus,
  Send,
  FileText,
  CalendarCheck,
  Trophy,
  XCircle,
} from "lucide-react";
import { PIPELINE_STAGE_OPTIONS } from "@/lib/constants";

interface StageStat {
  stage: string;
  count: number;
  totalValue: number;
}

interface PipelineStatsProps {
  stats: StageStat[];
  totalLeads: number;
  onStageClick: (stage: string) => void;
}

const STAGE_ICONS: Record<string, React.ReactNode> = {
  new: <UserPlus className="h-4 w-4" />,
  contacted: <Send className="h-4 w-4" />,
  quote_sent: <FileText className="h-4 w-4" />,
  meeting: <CalendarCheck className="h-4 w-4" />,
  won: <Trophy className="h-4 w-4" />,
  ignored: <XCircle className="h-4 w-4" />,
};

const STAGE_ACCENT: Record<string, string> = {
  new: "text-blue-600 bg-blue-50 border-blue-200 hover:border-blue-300",
  contacted: "text-yellow-700 bg-yellow-50 border-yellow-200 hover:border-yellow-300",
  quote_sent: "text-purple-600 bg-purple-50 border-purple-200 hover:border-purple-300",
  meeting: "text-indigo-600 bg-indigo-50 border-indigo-200 hover:border-indigo-300",
  won: "text-green-600 bg-green-50 border-green-200 hover:border-green-300",
  ignored: "text-gray-500 bg-gray-50 border-gray-200 hover:border-gray-300",
};

export function PipelineStats({
  stats,
  totalLeads,
  onStageClick,
}: PipelineStatsProps) {
  // Calculate active leads (excluding won + ignored)
  const activeLeads = stats
    .filter((s) => s.stage !== "won" && s.stage !== "ignored")
    .reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="mb-6">
      {/* Funnel progress bar */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-muted">
          {activeLeads} actief
        </span>
        <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-gray-100">
          {stats
            .filter((s) => s.count > 0)
            .map((s) => {
              const pct = totalLeads > 0 ? (s.count / totalLeads) * 100 : 0;
              const config = PIPELINE_STAGE_OPTIONS.find(
                (o) => o.value === s.stage
              );
              const bgColor = config?.color.split(" ")[0] ?? "bg-gray-200";
              return (
                <div
                  key={s.stage}
                  className={`${bgColor} transition-all`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                  title={`${config?.label}: ${s.count}`}
                />
              );
            })}
        </div>
        <span className="text-xs font-medium text-muted">
          {totalLeads} totaal
        </span>
      </div>

      {/* Stage tiles */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {PIPELINE_STAGE_OPTIONS.map((option) => {
          const stat = stats.find((s) => s.stage === option.value);
          const count = stat?.count ?? 0;
          const value = stat?.totalValue ?? 0;
          const accent = STAGE_ACCENT[option.value] ?? STAGE_ACCENT.new;
          const icon = STAGE_ICONS[option.value];

          return (
            <button
              key={option.value}
              onClick={() => onStageClick(option.value)}
              className={`flex flex-col items-start rounded-xl border p-3 transition-all cursor-pointer ${accent}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {icon}
                <span className="text-[11px] font-semibold uppercase tracking-wide">
                  {option.label}
                </span>
              </div>
              <span className="text-2xl font-bold leading-none">{count}</span>
              {value > 0 && option.value !== "ignored" && (
                <span className="text-[11px] mt-1 opacity-70">
                  €{value.toLocaleString("nl-BE")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
