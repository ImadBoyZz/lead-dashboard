import { daysBetween, staleLevel } from "@/lib/pipeline/days-in-stage";

interface StaleBadgeProps {
  stageChangedAt: Date | string | null | undefined;
  /** Als true: toont ook de "fresh" groene variant (default: verbergt fresh) */
  showFresh?: boolean;
}

const STYLES = {
  fresh: "bg-green-50 text-green-700 border-green-200",
  warming: "bg-yellow-50 text-yellow-700 border-yellow-200",
  aging: "bg-orange-50 text-orange-700 border-orange-200",
  stale: "bg-red-50 text-red-700 border-red-200",
} as const;

const LABELS = {
  fresh: "vers",
  warming: "opletten",
  aging: "verouderd",
  stale: "stilstand",
} as const;

export function StaleBadge({ stageChangedAt, showFresh = false }: StaleBadgeProps) {
  const level = staleLevel(stageChangedAt);
  if (level === "fresh" && !showFresh) return null;

  const days = daysBetween(stageChangedAt);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${STYLES[level]}`}
      title={`${days} dagen in deze stage`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {days}d · {LABELS[level]}
    </span>
  );
}
