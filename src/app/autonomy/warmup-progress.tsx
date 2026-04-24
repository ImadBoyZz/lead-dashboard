import { Card } from "@/components/ui/card";

interface WarmupProgressProps {
  startDate: string | null;
  currentDay: number | null;
  maxSendsToday: number;
  stage: string;
  overridden: boolean;
}

const STAGES = [
  { untilDay: 7, max: 5, label: "week 0" },
  { untilDay: 14, max: 10, label: "week 1" },
  { untilDay: 21, max: 25, label: "week 2" },
  { untilDay: 28, max: 50, label: "week 3" },
  { untilDay: 56, max: 100, label: "volle capaciteit" },
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

  const nextStage = STAGES.find((s) => currentDay !== null && currentDay < s.untilDay);

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-[--color-border-subtle]">
        <h3 className="text-base font-semibold text-foreground">Warmup ramp</h3>
        <p className="text-sm text-muted mt-0.5">
          {overridden
            ? `Override actief · vaste cap ${maxSendsToday}/dag`
            : stage === "not_started"
              ? "Nog niet gestart"
              : currentDay !== null
                ? `Dag ${currentDay} van ${TOTAL_DAYS} · cap ${maxSendsToday}/dag`
                : stage}
        </p>
      </div>

      <div className="p-6 space-y-4">
        <div className="relative">
          <div className="h-2 w-full rounded-full bg-[--color-border-subtle] overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${pct}%` }}
              aria-hidden
            />
          </div>

          <div className="relative mt-3 h-5">
            {STAGES.slice(0, -1).map((s) => {
              const stageLeft = (s.untilDay / TOTAL_DAYS) * 100;
              if (stageLeft > 100) return null;
              return (
                <div
                  key={s.untilDay}
                  className="absolute top-0 flex flex-col items-center -translate-x-1/2"
                  style={{ left: `${stageLeft}%` }}
                >
                  <span className="w-px h-1.5 bg-card-border" aria-hidden />
                  <span className="text-[10px] text-muted-foreground font-mono tabular mt-0.5">
                    d{s.untilDay}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2 text-[11px]">
          {STAGES.map((s) => {
            const isActive =
              currentDay !== null && currentDay < s.untilDay &&
              (currentDay >= (STAGES[STAGES.indexOf(s) - 1]?.untilDay ?? 0));
            return (
              <div
                key={s.untilDay}
                className={`rounded-md px-2 py-2 border text-center ${
                  isActive
                    ? "border-accent bg-blue-50 text-foreground"
                    : "border-[--color-border-subtle] text-muted"
                }`}
              >
                <div className="uppercase tracking-[0.08em] text-[10px]">{s.label}</div>
                <div className="font-mono tabular text-sm mt-0.5 text-foreground">
                  {s.max}/dag
                </div>
              </div>
            );
          })}
        </div>

        {nextStage && currentDay !== null && !overridden && (
          <div className="text-xs text-muted flex justify-between pt-1">
            <span>
              Volgende stap: <span className="text-foreground font-medium">{nextStage.max}/dag</span>{" "}
              over {nextStage.untilDay - currentDay} dag
              {nextStage.untilDay - currentDay === 1 ? "" : "en"}
            </span>
            {startDate && (
              <span className="font-mono tabular">
                start {new Date(startDate).toLocaleDateString("nl-BE")}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
