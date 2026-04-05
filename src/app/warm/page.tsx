export const dynamic = 'force-dynamic';

import Link from "next/link";
import { Globe, ArrowUpRight } from "lucide-react";
import { eq, and, desc, count } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import { LEAD_STATUS_OPTIONS } from "@/lib/constants";
import { WarmLeadActions } from "./warm-lead-actions";

export default async function WarmLeadsPage() {
  const conditions = [
    eq(schema.businesses.optOut, false),
    eq(schema.businesses.blacklisted, false),
    eq(schema.businesses.leadTemperature, 'warm'),
  ];

  const whereClause = and(...conditions);

  const [totalResult] = await db
    .select({ count: count() })
    .from(schema.businesses)
    .where(whereClause);

  const data = await db
    .select({
      business: schema.businesses,
      status: schema.leadStatuses,
    })
    .from(schema.businesses)
    .leftJoin(schema.leadStatuses, eq(schema.businesses.id, schema.leadStatuses.businessId))
    .where(whereClause)
    .orderBy(desc(schema.businesses.updatedAt));

  function getStatusOption(value: string | undefined) {
    if (!value) return null;
    return LEAD_STATUS_OPTIONS.find((s) => s.value === value) ?? null;
  }

  return (
    <div>
      <Header
        title="Warm Leads"
        description={formatNumber(totalResult.count) + " leads gefilterd"}
      />

      <Card>
        <div className="overflow-x-auto -mx-6 -mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-card-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Naam</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Sector</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Locatie</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Website</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">
                    Nog geen warm leads — markeer leads vanuit Cold Leads met het groene vinkje
                  </td>
                </tr>
              ) : (
                data.map((row, i) => {
                  const statusOpt = getStatusOption(row.status?.status);
                  return (
                    <tr
                      key={row.business.id}
                      className={"transition-colors hover:bg-blue-50/40" + (i % 2 === 1 ? " bg-gray-50/40" : "")}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={"/leads/" + row.business.id}
                          className="font-medium text-foreground hover:text-accent transition-colors"
                        >
                          {row.business.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted capitalize">
                        {row.business.sector ?? "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {row.business.city ?? "\u2014"}
                      </td>
                      <td className="px-4 py-3">
                        {row.business.website ? (
                          <a
                            href={row.business.website.startsWith("http") ? row.business.website : "https://" + row.business.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-accent hover:underline"
                          >
                            <Globe className="h-3.5 w-3.5" />
                            <span className="max-w-[140px] truncate">
                              {row.business.website.replace(/^https?:\/\/(www\.)?/, "")}
                            </span>
                            <ArrowUpRight className="h-3 w-3" />
                          </a>
                        ) : (
                          <Badge>Geen website</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {statusOpt ? (
                          <span className={"inline-flex items-center rounded-full text-xs font-medium px-2.5 py-0.5 " + statusOpt.color}>
                            {statusOpt.label}
                          </span>
                        ) : (
                          <Badge>Nieuw</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <WarmLeadActions leadId={row.business.id} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
