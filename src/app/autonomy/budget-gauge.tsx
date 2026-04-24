import { Card } from "@/components/ui/card";

interface BudgetGaugeProps {
  spentEur: number;
  budgetEur: number;
  byEndpoint: Array<{ endpoint: string; costEur: number }>;
}

const ENDPOINT_LABEL: Record<string, string> = {
  "/api/qualify": "Qualify",
  "/api/enrich/full": "Enrich (full)",
  "/api/enrich/website": "Enrich website",
  "/api/enrich/email": "Enrich email",
  "/api/ai/generate/batch": "Drafts (UI)",
  "/api/daily-batch/generate-drafts": "Drafts (auto)",
  "/api/daily-batch/discover": "Discovery",
};

export function BudgetGauge({ spentEur, budgetEur, byEndpoint }: BudgetGaugeProps) {
  const pct = budgetEur > 0 ? Math.min(100, (spentEur / budgetEur) * 100) : 0;
  const accentColor =
    pct >= 95 ? "var(--color-danger)" : pct >= 80 ? "var(--color-warning)" : "var(--color-accent)";

  const sortedEndpoints = [...byEndpoint]
    .filter((e) => e.costEur > 0)
    .sort((a, b) => b.costEur - a.costEur)
    .slice(0, 5);

  return (
    <Card className="!p-0 overflow-hidden h-full">
      <div className="px-6 py-4 border-b border-[--color-border-subtle]">
        <h3 className="text-base font-semibold text-foreground">Dagbudget</h3>
        <p className="text-sm text-muted mt-0.5">LLM + scrape kosten vandaag</p>
      </div>

      <div className="p-6 grid grid-cols-[auto_1fr] gap-6 items-center">
        <div
          className="relative w-24 h-24 rounded-full shrink-0"
          style={{
            background: `conic-gradient(${accentColor} ${pct * 3.6}deg, var(--color-border-subtle) 0)`,
          }}
          aria-label={`Budget ${pct.toFixed(0)}% gebruikt`}
          role="img"
        >
          <div className="absolute inset-1.5 rounded-full bg-card flex items-center justify-center">
            <span className="font-mono tabular text-xl font-medium text-foreground">
              {pct.toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono tabular text-2xl font-medium text-foreground">
              €{spentEur.toFixed(3)}
            </span>
            <span className="text-sm text-muted font-mono tabular">/ €{budgetEur}</span>
          </div>
          <span className="text-xs text-muted">
            €{Math.max(0, budgetEur - spentEur).toFixed(3)} resterend vandaag
          </span>
        </div>
      </div>

      {sortedEndpoints.length > 0 && (
        <div className="border-t border-[--color-border-subtle] px-6 py-4">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-2">
            Top cost drivers
          </div>
          <ul className="space-y-1.5">
            {sortedEndpoints.map((e) => {
              const pct = spentEur > 0 ? (e.costEur / spentEur) * 100 : 0;
              const label = ENDPOINT_LABEL[e.endpoint] ?? e.endpoint.replace("/api/", "");
              return (
                <li key={e.endpoint} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                  <span className="text-sm text-foreground truncate" title={e.endpoint}>
                    {label}
                  </span>
                  <div className="w-20 h-1 rounded-full bg-[--color-border-subtle] overflow-hidden">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${pct}%` }}
                      aria-hidden
                    />
                  </div>
                  <span className="font-mono tabular text-xs text-muted w-14 text-right">
                    €{e.costEur.toFixed(3)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
