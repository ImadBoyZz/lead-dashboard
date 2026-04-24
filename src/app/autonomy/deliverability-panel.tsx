import { Card } from "@/components/ui/card";
import { MetricTile } from "@/components/ui/metric-tile";
import { StatusDot } from "@/components/ui/status-dot";
import { KillSwitchToggle } from "./kill-switch-toggle";

interface DeliverabilityPanelProps {
  delivered: number;
  bounces: number;
  complaints: number;
  bouncePct: number;
  complaintPct: number;
  minVolumeMet: boolean;
}

const BOUNCE_THRESHOLD = 2.0;
const COMPLAINT_THRESHOLD = 0.1;
const MIN_VOLUME = 20;

export function DeliverabilityPanel({
  delivered,
  bounces,
  complaints,
  bouncePct,
  complaintPct,
  minVolumeMet,
}: DeliverabilityPanelProps) {
  const bounceVariant = !minVolumeMet
    ? "idle"
    : bouncePct > BOUNCE_THRESHOLD && bounces >= 3
      ? "danger"
      : bouncePct > BOUNCE_THRESHOLD / 2
        ? "warning"
        : "success";

  const complaintVariant = !minVolumeMet
    ? "idle"
    : complaintPct > COMPLAINT_THRESHOLD
      ? "danger"
      : complaints > 0
        ? "warning"
        : "success";

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-[--color-border-subtle]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Deliverability</h3>
            <p className="text-sm text-muted mt-0.5">
              Rolling 7 dagen · drempel auto-pause bij {BOUNCE_THRESHOLD}% bounce of{" "}
              {COMPLAINT_THRESHOLD}% complaint
            </p>
          </div>
          {!minVolumeMet && (
            <span className="text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
              Min-volume floor · {delivered}/{MIN_VOLUME}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-[--color-border-subtle]">
        <div className="p-5">
          <MetricTile
            label="Delivered"
            value={delivered}
            hint={minVolumeMet ? "telling actief" : `nog ${Math.max(0, MIN_VOLUME - delivered)} tot drempels werken`}
          />
        </div>
        <div className="p-5">
          <MetricTile
            label="Bounce rate"
            value={`${bouncePct.toFixed(2)}%`}
            hint={`${bounces} bounces`}
            accent={bounceVariant === "danger" ? "danger" : bounceVariant === "warning" ? "warning" : "default"}
          />
          <div className="mt-2">
            <StatusDot
              variant={bounceVariant}
              label={
                !minVolumeMet
                  ? "onder minimum volume"
                  : bouncePct > BOUNCE_THRESHOLD && bounces >= 3
                    ? "auto-pause drempel bereikt"
                    : "binnen marge"
              }
            />
          </div>
        </div>
        <div className="p-5">
          <MetricTile
            label="Complaint rate"
            value={`${complaintPct.toFixed(3)}%`}
            hint={`${complaints} klachten`}
            accent={complaintVariant === "danger" ? "danger" : complaintVariant === "warning" ? "warning" : "default"}
          />
          <div className="mt-2">
            <StatusDot
              variant={complaintVariant}
              label={
                !minVolumeMet
                  ? "onder minimum volume"
                  : complaintPct > COMPLAINT_THRESHOLD
                    ? "auto-pause drempel bereikt"
                    : "binnen marge"
              }
            />
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-[--color-border-subtle] bg-[--color-surface-hover]/40">
        <KillSwitchToggle />
      </div>
    </Card>
  );
}
