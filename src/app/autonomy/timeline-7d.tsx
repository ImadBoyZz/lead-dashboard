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

function dayLabel(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("nl-BE", { weekday: "short" })
    .replace(".", "")
    .toLowerCase();
}

function dayNumber(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-BE", { day: "2-digit" });
}

export function Timeline7d({ rows, bouncesByDate }: Timeline7dProps) {
  const bouncesMap = new Map(bouncesByDate.map((b) => [b.date, b.count]));
  const sortedRows = [...rows]
    .sort(
      (a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime(),
    )
    .slice(-7);

  const totalSent = sortedRows.reduce((a, r) => a + (r.actualSent ?? 0), 0);
  const totalBounces = sortedRows.reduce(
    (a, r) => a + (bouncesMap.get(r.runDate) ?? 0),
    0,
  );
  const totalCost = sortedRows.reduce((a, r) => a + (r.costEur ?? 0), 0);

  const maxValue = Math.max(
    1,
    ...sortedRows.flatMap((r) => [
      r.actualSent ?? 0,
      bouncesMap.get(r.runDate) ?? 0,
    ]),
  );

  return (
    <section className="bg-surface border border-[--color-rule] rounded-[2px]">
      <header className="px-6 pt-5 pb-4 border-b border-[--color-rule]">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="module-label mb-1.5">§ 05 — 7-daags verloop</div>
            <h2 className="text-[15px] leading-[1.3] font-medium text-ink tracking-[-0.01em]">
              Dagelijks sent + bounces
            </h2>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono tabular uppercase tracking-[0.08em] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-ink" aria-hidden /> sent
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-danger" aria-hidden /> bounces
            </span>
          </div>
        </div>
      </header>

      <div className="p-6">
        {sortedRows.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-ink-muted">
            Nog geen dagelijkse data. Vult zich bij eerste daily_batches upsert (18:00 digest).
          </div>
        ) : (
          <>
            {/* Custom bars — mono labels, grid-aligned */}
            <div className="grid grid-cols-7 gap-4 h-24">
              {sortedRows.map((r) => {
                const sent = r.actualSent ?? 0;
                const b = bouncesMap.get(r.runDate) ?? 0;
                const sentPct = (sent / maxValue) * 100;
                const bouncePct = (b / maxValue) * 100;
                return (
                  <div
                    key={r.runDate}
                    className="flex flex-col justify-end items-center gap-1"
                  >
                    <div className="flex items-end gap-1 w-full h-full justify-center">
                      <div
                        className="w-4 bg-ink transition-all duration-500"
                        style={{ height: `${Math.max(sent > 0 ? 3 : 0, sentPct)}%` }}
                        title={`${r.runDate}: ${sent} sent`}
                        aria-hidden
                      />
                      {b > 0 && (
                        <div
                          className="w-4 bg-danger transition-all duration-500"
                          style={{ height: `${Math.max(3, bouncePct)}%` }}
                          title={`${r.runDate}: ${b} bounces`}
                          aria-hidden
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hairline baseline */}
            <div className="h-px bg-[--color-rule] mt-1" aria-hidden />

            {/* Day axis */}
            <div className="grid grid-cols-7 gap-4 mt-2">
              {sortedRows.map((r) => (
                <div
                  key={r.runDate}
                  className="flex flex-col items-center gap-0.5"
                >
                  <span className="font-mono tabular text-[11px] text-ink">
                    {dayNumber(r.runDate)}
                  </span>
                  <span className="font-mono tabular text-[10px] text-ink-soft uppercase tracking-[0.06em]">
                    {dayLabel(r.runDate)}
                  </span>
                </div>
              ))}
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-3 gap-4 pt-5 mt-5 border-t border-[--color-rule]">
              <div>
                <div className="module-label">Totaal sent</div>
                <div className="font-mono tabular text-[22px] leading-none tracking-[-0.02em] text-ink mt-2">
                  {totalSent}
                </div>
              </div>
              <div>
                <div className="module-label">Bounces</div>
                <div
                  className={`font-mono tabular text-[22px] leading-none tracking-[-0.02em] mt-2 ${
                    totalBounces > 0 ? "text-danger" : "text-ink"
                  }`}
                >
                  {totalBounces}
                </div>
              </div>
              <div>
                <div className="module-label">Kost 7d</div>
                <div className="font-mono tabular text-[22px] leading-none tracking-[-0.02em] text-ink mt-2">
                  €{totalCost.toFixed(2)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
