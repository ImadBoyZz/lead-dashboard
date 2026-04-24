import { cn } from "@/lib/utils";

interface WarmupProgressProps {
  startDate: string | null;
  currentDay: number | null;
  maxSendsToday: number;
  stage: string;
  overridden: boolean;
}

const STAGES = [
  { untilDay: 7, max: 5, label: "w0" },
  { untilDay: 14, max: 10, label: "w1" },
  { untilDay: 21, max: 25, label: "w2" },
  { untilDay: 28, max: 50, label: "w3" },
  { untilDay: 56, max: 100, label: "w4+" },
];

const TOTAL_DAYS = 28;

export function WarmupProgress({
  startDate,
  currentDay,
  maxSendsToday,
  stage,
  overridden,
}: WarmupProgressProps) {
  const pct =
    currentDay === null
      ? 0
      : Math.min(100, (Math.min(currentDay, TOTAL_DAYS) / TOTAL_DAYS) * 100);

  const nextStage = STAGES.find(
    (s) => currentDay !== null && currentDay < s.untilDay,
  );

  return (
    <section className="bg-surface border border-[--color-rule] rounded-[2px] h-full">
      <header className="px-6 pt-5 pb-4 border-b border-[--color-rule]">
        <div className="module-label mb-1.5">§ 03 — warmup ramp</div>
        <h2 className="text-[15px] leading-[1.3] font-medium text-ink tracking-[-0.01em]">
          {overridden
            ? "Override actief"
            : stage === "not_started"
              ? "Nog niet gestart"
              : `Dag ${currentDay ?? "—"} / ${TOTAL_DAYS}`}
        </h2>
        <p className="text-[12.5px] text-ink-muted mt-1 leading-[1.5] font-mono tabular">
          cap {maxSendsToday}/dag
          {startDate && ` · start ${new Date(startDate).toLocaleDateString("nl-BE")}`}
        </p>
      </header>

      <div className="p-6 space-y-5">
        {/* Progress track */}
        <div className="relative">
          <div className="h-[3px] w-full bg-[--color-rule] relative">
            <div
              className="absolute inset-y-0 left-0 bg-ink transition-[width] duration-500"
              style={{ width: `${pct}%` }}
              aria-hidden
            />
          </div>

          <div className="relative mt-2 h-4">
            {[7, 14, 21, 28].map((d) => {
              const left = (d / TOTAL_DAYS) * 100;
              const reached = currentDay !== null && currentDay >= d;
              return (
                <div
                  key={d}
                  className="absolute top-0 flex flex-col items-center -translate-x-1/2"
                  style={{ left: `${left}%` }}
                >
                  <span
                    className={cn(
                      "w-px h-1.5",
                      reached ? "bg-ink" : "bg-[--color-rule]",
                    )}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "font-mono tabular text-[10px] tracking-[0.04em] mt-0.5",
                      reached ? "text-ink-muted" : "text-ink-soft",
                    )}
                  >
                    d{d}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stage grid */}
        <div className="grid grid-cols-5 border-t border-[--color-rule] pt-4">
          {STAGES.map((s, idx) => {
            const prevDay = idx > 0 ? STAGES[idx - 1].untilDay : 0;
            const isActive =
              currentDay !== null &&
              currentDay >= prevDay &&
              currentDay < s.untilDay;
            return (
              <div
                key={s.untilDay}
                className={cn(
                  "flex flex-col gap-1.5 px-1",
                  idx > 0 && "border-l border-[--color-rule]",
                  idx > 0 && "pl-3",
                  idx < STAGES.length - 1 && "pr-1",
                )}
              >
                <div
                  className={cn(
                    "module-label",
                    isActive && "text-accent",
                  )}
                >
                  {s.label}
                </div>
                <div
                  className={cn(
                    "font-mono tabular text-[15px] tracking-[-0.02em]",
                    isActive ? "text-ink" : "text-ink-soft",
                  )}
                >
                  {s.max}/dag
                </div>
              </div>
            );
          })}
        </div>

        {nextStage && currentDay !== null && !overridden && (
          <div className="text-[12px] text-ink-muted flex justify-between pt-4 border-t border-[--color-rule] font-mono tabular">
            <span>
              Volgende stap →{" "}
              <span className="text-ink font-medium">{nextStage.max}/dag</span>
            </span>
            <span>
              over {nextStage.untilDay - currentDay}{" "}
              {nextStage.untilDay - currentDay === 1 ? "dag" : "dagen"}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
