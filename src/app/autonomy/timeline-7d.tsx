import { Card } from "@/components/ui/card";
import { Sparkline, type SparklineBar } from "@/components/ui/sparkline";

interface Timeline7dProps {
  rows: Array<{
    runDate: string;
    actualSent: number;
    qualified: number;
    rejected: number;
    costEur: number;
  }>;
  bouncesByDate: Array<{ date: string; count: number }>;
}

function formatShortDate(d: string): string {
  return new Date(d).toLocaleDateString("nl-BE", { weekday: "short" }).replace(".", "");
}

export function Timeline7d({ rows, bouncesByDate }: Timeline7dProps) {
  const bouncesMap = new Map(bouncesByDate.map((b) => [b.date, b.count]));
  const sortedRows = [...rows]
    .sort((a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime())
    .slice(-7);

  const bars: SparklineBar[] = sortedRows.map((r) => ({
    label: formatShortDate(r.runDate),
    primary: r.actualSent ?? 0,
    secondary: bouncesMap.get(r.runDate) ?? 0,
  }));

  const totalSent = sortedRows.reduce((a, r) => a + (r.actualSent ?? 0), 0);
  const totalBounces = bars.reduce((a, b) => a + (b.secondary ?? 0), 0);
  const totalCost = sortedRows.reduce((a, r) => a + (r.costEur ?? 0), 0);

  return (
    <Card className="!p-0 overflow-hidden h-full">
      <div className="px-6 py-4 border-b border-[--color-border-subtle]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Laatste 7 dagen</h3>
            <p className="text-sm text-muted mt-0.5">Verstuurde mails + bounces per dag</p>
          </div>
          <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-accent" aria-hidden /> Sent
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-danger/75" aria-hidden /> Bounces
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {bars.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">
            Nog geen dagelijkse data. Vult zich bij eerste `daily_batches` upsert (18:00 digest).
          </div>
        ) : (
          <>
            <div className="h-16">
              <Sparkline
                data={bars}
                height={64}
                ariaLabel="Verstuurde mails en bounces per dag"
              />
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {bars.map((b, i) => (
                <div
                  key={i}
                  className="text-[10px] uppercase tracking-[0.05em] text-muted-foreground"
                >
                  {b.label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-4 pt-3 border-t border-[--color-border-subtle]">
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  Totaal sent
                </div>
                <div className="font-mono tabular text-lg text-foreground">{totalSent}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  Bounces
                </div>
                <div className="font-mono tabular text-lg text-foreground">{totalBounces}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  Kost 7d
                </div>
                <div className="font-mono tabular text-lg text-foreground">
                  €{totalCost.toFixed(2)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
