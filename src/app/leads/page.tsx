export const dynamic = 'force-dynamic';

import Link from "next/link";
import { Download, Globe, ArrowUpRight, Zap } from "lucide-react";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { SmartImportButton } from "@/components/leads/smart-import-button";
import { LeadFilters } from "@/components/leads/lead-filters";
import { LeadActions } from "@/components/leads/lead-actions";
import { InsightsWidget } from "@/components/ai/insights-widget";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import {
  buildColdLeadsWhere,
  fetchColdLeads,
  serializeColdLeadFilters,
  type ColdLeadFilters,
} from "@/lib/db/queries/cold-leads";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const filters: ColdLeadFilters = {
    country: (params.country as string) || undefined,
    province: (params.province as string) || undefined,
    status: (params.status as string) || undefined,
    sector: (params.sector as string) || undefined,
    search: (params.search as string) || undefined,
    naceCode: (params.naceCode as string) || undefined,
    hasWebsite: (params.hasWebsite as string) || undefined,
    imported: (params.imported as string) || undefined,
    sort: (params.sort as string) || "recent",
    order: (params.order as string) || undefined,
  };

  const page = Math.max(1, parseInt((params.page as string) ?? "1", 10));
  const limit = ITEMS_PER_PAGE;
  const offset = (page - 1) * limit;

  const whereClause = buildColdLeadsWhere(filters);

  const [totalResult] = await db
    .select({ count: count() })
    .from(schema.businesses)
    .leftJoin(schema.leadScores, eq(schema.businesses.id, schema.leadScores.businessId))
    .leftJoin(schema.leadStatuses, eq(schema.businesses.id, schema.leadStatuses.businessId))
    .where(whereClause);

  const total = totalResult.count;
  const totalPages = Math.ceil(total / limit);

  const data = await fetchColdLeads(filters, { limit, offset });

  const filterParams = serializeColdLeadFilters(filters);
  const exportParams = new URLSearchParams(filterParams);
  const exportUrl = "/api/export?" + exportParams.toString();
  const triageUrl = "/leads/triage?" + exportParams.toString();

  return (
    <div>
      <Header
        title="Cold Leads"
        description=""
        actions={
          <div className="flex items-center gap-2">
            <SmartImportButton />
            <Link href={triageUrl}>
              <Button variant="primary" size="sm" disabled={total === 0}>
                <Zap className="h-4 w-4" />
                Work Mode ({total})
              </Button>
            </Link>
            <a href={exportUrl}>
              <Button variant="secondary" size="sm">
                <Download className="h-4 w-4" />
                CSV Export
              </Button>
            </a>
          </div>
        }
      />

      <LeadFilters
        filters={{
          country: filters.country,
          province: filters.province,
          status: filters.status,
          sector: filters.sector,
          search: filters.search,
          naceCode: filters.naceCode,
          hasWebsite: filters.hasWebsite,
          imported: filters.imported,
          sort: filters.sort,
          order: filters.order,
        }}
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted">
                    Geen leads gevonden
                  </td>
                </tr>
              ) : (
                data.map((row, i) => {
                  return (
                    <tr
                      key={row.business.id}
                      className={"transition-colors hover:bg-blue-50/40" + (i % 2 === 1 ? " bg-gray-50/40" : "")}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={"/leads/" + row.business.id}
                            className="font-medium text-foreground hover:text-accent transition-colors"
                          >
                            {row.business.name}
                          </Link>
                          {row.business.chainWarning && (
                            <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700" title={row.business.chainWarning}>
                              Mogelijk keten
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted capitalize">
                        {row.business.sector ?? "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {row.business.city && row.business.province
                          ? row.business.city + ", " + row.business.province
                          : row.business.city || row.business.province || "\u2014"}
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
                        <LeadActions leadId={row.business.id} temperature={row.business.leadTemperature} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        basePath="/leads"
        searchParams={filterParams}
      />

      <InsightsWidget />
    </div>
  );
}
