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
    <section className="bg-surface border border-[--color-rule] rounded-[2px]">
      <header className="px-6 pt-5 pb-4 border-b border-[--color-rule]">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="module-label mb-1.5">§ 02 — deliverability</div>
            <h2 className="text-[15px] leading-[1.3] font-medium text-ink tracking-[-0.01em]">
              Rolling 7 dagen
            </h2>
            <p className="text-[12.5px] text-ink-muted mt-1 leading-[1.5]">
              Auto-pause bij {BOUNCE_THRESHOLD}% bounce of {COMPLAINT_THRESHOLD}% complaint,
              met minimum-volume floor van {MIN_VOLUME} delivered.
            </p>
          </div>
          {!minVolumeMet && (
            <div className="shrink-0 text-right">
              <div className="module-label">Min-volume floor</div>
              <div className="font-mono tabular text-[13px] text-ink-muted mt-0.5">
                {delivered} / {MIN_VOLUME}
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-3 divide-x divide-[--color-rule]">
        <div className="p-6">
          <MetricTile
            label="Delivered"
            value={delivered}
            hint={
              minVolumeMet
                ? "drempels actief"
                : `nog ${Math.max(0, MIN_VOLUME - delivered)} tot drempels werken`
            }
          />
        </div>
        <div className="p-6">
          <MetricTile
            label="Bounce rate"
            value={`${bouncePct.toFixed(2)}%`}
            hint={`${bounces} bounces`}
            accent={
              bounceVariant === "danger"
                ? "danger"
                : bounceVariant === "warning"
                  ? "warning"
                  : "default"
            }
          />
          <div className="mt-3">
            <StatusDot
              variant={bounceVariant}
              label={
                !minVolumeMet
                  ? "onder minimum volume"
                  : bouncePct > BOUNCE_THRESHOLD && bounces >= 3
                    ? "drempel bereikt"
                    : "binnen marge"
              }
            />
          </div>
        </div>
        <div className="p-6">
          <MetricTile
            label="Complaint rate"
            value={`${complaintPct.toFixed(3)}%`}
            hint={`${complaints} klachten`}
            accent={
              complaintVariant === "danger"
                ? "danger"
                : complaintVariant === "warning"
                  ? "warning"
                  : "default"
            }
          />
          <div className="mt-3">
            <StatusDot
              variant={complaintVariant}
              label={
                !minVolumeMet
                  ? "onder minimum volume"
                  : complaintPct > COMPLAINT_THRESHOLD
                    ? "drempel bereikt"
                    : "binnen marge"
              }
            />
          </div>
        </div>
      </div>

      <div className="px-6 py-5 border-t border-[--color-rule] bg-[--color-surface-alt]">
        <KillSwitchToggle />
      </div>
    </section>
  );
}
