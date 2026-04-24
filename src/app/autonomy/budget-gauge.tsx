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
  "/api/ai/generate/batch": "Drafts UI",
  "/api/daily-batch/generate-drafts": "Drafts auto",
  "/api/daily-batch/discover": "Discovery",
};

export function BudgetGauge({
  spentEur,
  budgetEur,
  byEndpoint,
}: BudgetGaugeProps) {
  const pct = budgetEur > 0 ? Math.min(100, (spentEur / budgetEur) * 100) : 0;
  const accentColor =
    pct >= 95
      ? "var(--color-danger)"
      : pct >= 80
        ? "var(--color-warning)"
        : "var(--color-ink)";

  const sortedEndpoints = [...byEndpoint]
    .filter((e) => e.costEur > 0)
    .sort((a, b) => b.costEur - a.costEur)
    .slice(0, 5);

  return (
    <section className="bg-surface border border-[--color-rule] rounded-[2px] h-full">
      <header className="px-6 pt-5 pb-4 border-b border-[--color-rule]">
        <div className="module-label mb-1.5">§ 04 — dagbudget</div>
        <h2 className="text-[15px] leading-[1.3] font-medium text-ink tracking-[-0.01em]">
          Vandaag verbruikt
        </h2>
        <p className="text-[12.5px] text-ink-muted mt-1 leading-[1.5]">
          LLM en scrape-kosten sinds middernacht CET
        </p>
      </header>

      <div className="p-6 space-y-5">
        {/* Bar-style gauge ipv circle — meer Working Drawing */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="flex items-baseline gap-2">
              <span className="font-mono tabular text-[28px] leading-none tracking-[-0.02em] text-ink">
                €{spentEur.toFixed(3)}
              </span>
              <span className="text-[13px] text-ink-muted font-mono tabular">
                / €{budgetEur.toFixed(2)}
              </span>
            </div>
            <span className="font-mono tabular text-[13px] text-ink-muted">
              {pct.toFixed(1)}%
            </span>
          </div>

          <div className="h-[5px] w-full bg-[--color-rule] relative">
            <div
              className="absolute inset-y-0 left-0 transition-[width] duration-500"
              style={{ width: `${pct}%`, backgroundColor: accentColor }}
              aria-hidden
            />
            {/* 80% warning marker */}
            <div
              className="absolute top-[-3px] bottom-[-3px] w-px bg-[--color-rule-strong]"
              style={{ left: "80%" }}
              aria-hidden
            />
          </div>

          <div className="flex items-center justify-between mt-2 text-[11px] font-mono tabular text-ink-soft">
            <span>€0</span>
            <span>80% alert</span>
            <span>€{budgetEur}</span>
          </div>
        </div>

        {sortedEndpoints.length > 0 && (
          <div className="pt-4 border-t border-[--color-rule]">
            <div className="module-label mb-3">Top cost drivers</div>
            <ul className="space-y-2.5">
              {sortedEndpoints.map((e) => {
                const rowPct = spentEur > 0 ? (e.costEur / spentEur) * 100 : 0;
                const label =
                  ENDPOINT_LABEL[e.endpoint] ?? e.endpoint.replace("/api/", "");
                return (
                  <li
                    key={e.endpoint}
                    className="grid grid-cols-[1fr_auto] gap-4 items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 text-[12.5px]">
                        <span className="text-ink truncate" title={e.endpoint}>
                          {label}
                        </span>
                        <span className="font-mono tabular text-[11px] text-ink-soft">
                          {rowPct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-[2px] mt-1.5 bg-[--color-rule]">
                        <div
                          className="h-full bg-ink-muted"
                          style={{ width: `${rowPct}%` }}
                          aria-hidden
                        />
                      </div>
                    </div>
                    <span className="font-mono tabular text-[12.5px] text-ink w-16 text-right">
                      €{e.costEur.toFixed(3)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
