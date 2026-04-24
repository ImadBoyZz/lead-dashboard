import { MetricTile } from "@/components/ui/metric-tile";
import { StatusDot } from "@/components/ui/status-dot";

interface StatusStripeProps {
  sendEnabled: boolean;
  pausedReason: string | null;
  warmupStage: string;
  warmupDay: number | null;
  warmupCap: number;
  sentToday: number;
  pendingReview: number;
  approvedQueue: number;
  budgetSpentEur: number;
  budgetTotalEur: number;
}

function stageLabel(stage: string, day: number | null): string {
  if (stage === "not_started") return "niet gestart";
  if (stage === "override") return "override actief";
  if (stage === "full_capacity") return "volle capaciteit";
  if (day !== null) return `week ${Math.floor(day / 7)} — dag ${day}`;
  return stage;
}

export function StatusStripe({
  sendEnabled,
  pausedReason,
  warmupStage,
  warmupDay,
  warmupCap,
  sentToday,
  pendingReview,
  approvedQueue,
  budgetSpentEur,
  budgetTotalEur,
}: StatusStripeProps) {
  const budgetPct =
    budgetTotalEur > 0 ? Math.round((budgetSpentEur / budgetTotalEur) * 100) : 0;
  const budgetAccent =
    budgetPct >= 95 ? "danger" : budgetPct >= 80 ? "warning" : "default";

  const sendVariant = sendEnabled ? "success" : "danger";
  const sendLabel = sendEnabled
    ? "Send actief"
    : pausedReason
      ? `Gepauzeerd · ${pausedReason}`
      : "Send uit";

  return (
    <section className="bg-surface border border-[--color-rule] rounded-[2px]">
      <div className="flex items-center justify-between px-6 py-3 border-b border-[--color-rule]">
        <div className="flex items-center gap-2.5">
          <StatusDot variant={sendVariant} pulse={!sendEnabled} />
          <span className="text-[13px] text-ink font-medium">{sendLabel}</span>
        </div>
        <div className="module-label">§ 01 — systeem</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-[--color-rule]">
        <div className="p-6">
          <MetricTile
            label="Warmup cap"
            value={warmupCap}
            unit="/dag"
            hint={stageLabel(warmupStage, warmupDay)}
          />
        </div>
        <div className="p-6">
          <MetricTile
            label="Vandaag verstuurd"
            value={sentToday}
            unit={`/ ${warmupCap}`}
            hint={sentToday >= warmupCap ? "cap bereikt" : "binnen cap"}
            accent={sentToday >= warmupCap ? "warning" : "default"}
          />
        </div>
        <div className="p-6">
          <MetricTile
            label="Pending review"
            value={pendingReview}
            hint={
              pendingReview === 0
                ? "alles beoordeeld"
                : `${approvedQueue} approved in queue`
            }
            accent={pendingReview > 30 ? "warning" : "default"}
          />
        </div>
        <div className="p-6">
          <MetricTile
            label="Budget"
            value={`€${budgetSpentEur.toFixed(2)}`}
            unit={`/ €${budgetTotalEur}`}
            hint={`${budgetPct}% gebruikt`}
            accent={budgetAccent}
          />
        </div>
        <div className="p-6">
          <MetricTile
            label="Warmup dag"
            value={warmupDay ?? "—"}
            unit={warmupDay !== null ? "/ 28" : undefined}
            hint={warmupStage === "full_capacity" ? "ramp voltooid" : "ramp loopt"}
          />
        </div>
      </div>
    </section>
  );
}
