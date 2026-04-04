export const dynamic = 'force-dynamic';

import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/leads/score-badge";
import { LEAD_STATUS_OPTIONS } from "@/lib/constants";

const PIPELINE_STATUSES = ["new", "contacted", "replied", "meeting", "won", "lost"] as const;

export default async function PipelinePage() {
  // Fetch all non-opted-out leads with score and status
  const data = await db
    .select({
      business: schema.businesses,
      score: schema.leadScores,
      status: schema.leadStatuses,
    })
    .from(schema.businesses)
    .leftJoin(schema.leadScores, eq(schema.businesses.id, schema.leadScores.businessId))
    .leftJoin(schema.leadStatuses, eq(schema.businesses.id, schema.leadStatuses.businessId))
    .where(eq(schema.businesses.optOut, false))
    .orderBy(desc(schema.leadScores.totalScore));

  // Group by status
  const grouped: Record<string, typeof data> = {};
  for (const status of PIPELINE_STATUSES) {
    grouped[status] = [];
  }
  for (const row of data) {
    const s = row.status?.status ?? "new";
    if (grouped[s]) {
      grouped[s].push(row);
    }
  }

  function getStatusConfig(value: string) {
    return LEAD_STATUS_OPTIONS.find((s) => s.value === value);
  }

  function getDaysInStage(statusChangedAt: Date | null): number | null {
    if (!statusChangedAt) return null;
    const now = new Date();
    const diffMs = now.getTime() - new Date(statusChangedAt).getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  return (
    <div>
      <Header
        title="Pipeline"
        description="Kanban overzicht van alle leads per status"
      />

      <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
        {PIPELINE_STATUSES.map((statusKey) => {
          const config = getStatusConfig(statusKey);
          const leads = grouped[statusKey] ?? [];

          return (
            <div
              key={statusKey}
              className="flex-shrink-0 w-72 bg-gray-50/80 rounded-xl border border-card-border"
            >
              {/* Column header */}
              <div className="p-3 border-b border-card-border">
                <div className="flex items-center justify-between">
                  <span className={"inline-flex items-center rounded-full text-xs font-medium px-2.5 py-0.5 " + (config?.color ?? "bg-gray-100 text-gray-700")}>
                    {config?.label ?? statusKey}
                  </span>
                  <Badge>{leads.length}</Badge>
                </div>
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto">
                {leads.length === 0 ? (
                  <p className="text-xs text-muted text-center py-6">Geen leads</p>
                ) : (
                  leads.map((row) => {
                    const days = getDaysInStage(row.status?.statusChangedAt ?? null);
                    return (
                      <Link
                        key={row.business.id}
                        href={"/leads/" + row.business.id}
                        className="block bg-white rounded-lg border border-card-border p-3 hover:shadow-sm hover:border-accent/30 transition-all"
                      >
                        <p className="text-sm font-medium text-foreground truncate">
                          {row.business.name}
                        </p>
                        <p className="text-xs text-muted mt-0.5">
                          {row.business.city ?? "Onbekend"}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <ScoreBadge score={row.score?.totalScore ?? null} />
                          {days !== null && (
                            <span className="text-xs text-muted">
                              {days}d
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
