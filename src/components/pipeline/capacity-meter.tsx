interface CapacityMeterProps {
  active: number;
  max?: number;
}

/**
 * Visuele capaciteitsmeter voor de actieve pipeline queue.
 * Dwingt de MAX_ACTIVE_LEADS discipline visueel af: amber bij 90%, rood bij full.
 */
export function CapacityMeter({ active, max = 15 }: CapacityMeterProps) {
  const pct = Math.min(100, (active / max) * 100);
  const state =
    active >= max ? "full" : active >= max - 1 ? "warning" : "ok";

  const barColor =
    state === "full"
      ? "bg-red-500"
      : state === "warning"
      ? "bg-amber-500"
      : "bg-green-500";
  const textColor =
    state === "full"
      ? "text-red-700"
      : state === "warning"
      ? "text-amber-700"
      : "text-muted";

  return (
    <div className="inline-flex items-center gap-2">
      <div className="relative h-2 w-28 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold ${textColor}`}>
        {active}/{max}
      </span>
    </div>
  );
}
