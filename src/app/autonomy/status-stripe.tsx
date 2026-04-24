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
  if (day !== null) return `week ${Math.floor(day / 7)} · dag ${day}`;
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
      ? `Gepauzeerd: ${pausedReason}`
      : "Send uit";

  return (
    <section className="rounded-xl border border-card-border bg-card">
      <div className="flex items-center justify-between px-6 py-3 border-b border-[--color-border-subtle]">
        <div className="flex items-center gap-2">
          <StatusDot variant={sendVariant} pulse={!sendEnabled} />
          <span className="text-sm font-medium text-foreground">{sendLabel}</span>
        </div>
        <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          Live status
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-[--color-border-subtle]">
        <div className="p-5">
          <MetricTile
            label="Warmup"
            value={warmupCap}
            unit="/dag"
            hint={stageLabel(warmupStage, warmupDay)}
          />
        </div>
        <div className="p-5">
          <MetricTile
            label="Verstuurd vandaag"
            value={sentToday}
            unit={`/ ${warmupCap}`}
            hint={sentToday >= warmupCap ? "cap bereikt" : "binnen cap"}
            accent={sentToday >= warmupCap ? "warning" : "default"}
          />
        </div>
        <div className="p-5">
          <MetricTile
            label="Pending review"
            value={pendingReview}
            hint={pendingReview === 0 ? "alles beoordeeld" : `${approvedQueue} approved wacht op send`}
            accent={pendingReview > 30 ? "warning" : "default"}
          />
        </div>
        <div className="p-5">
          <MetricTile
            label="Budget"
            value={`€${budgetSpentEur.toFixed(2)}`}
            unit={`/ €${budgetTotalEur}`}
            hint={`${budgetPct}% gebruikt`}
            accent={budgetAccent}
          />
        </div>
        <div className="p-5">
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
