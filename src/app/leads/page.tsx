export const dynamic = 'force-dynamic';

import Link from "next/link";
import { Download, Globe, ArrowUpRight } from "lucide-react";
import { eq, and, or, desc, asc, ilike, gte, lte, isNull, isNotNull, count } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { ScoreBadge } from "@/components/leads/score-badge";
import { SmartImportButton } from "@/components/leads/smart-import-button";
import { LeadFilters } from "@/components/leads/lead-filters";
import { formatDate, formatNumber } from "@/lib/utils";
import { LEAD_STATUS_OPTIONS, ITEMS_PER_PAGE } from "@/lib/constants";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const country = (params.country as string) || undefined;
  const province = (params.province as string) || undefined;
  const status = (params.status as string) || undefined;
  const scoreMin = (params.scoreMin as string) || undefined;
  const scoreMax = (params.scoreMax as string) || undefined;
  const search = (params.search as string) || undefined;
  const naceCode = (params.naceCode as string) || undefined;
  const hasWebsite = (params.hasWebsite as string) || undefined;
  const sort = (params.sort as string) || "score";
  const order = (params.order as string) || (sort === "score" ? "desc" : "asc");
  const page = Math.max(1, parseInt((params.page as string) ?? "1", 10));
  const limit = ITEMS_PER_PAGE;
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const conditions = [];
  conditions.push(eq(schema.businesses.optOut, false));

  if (country) {
    conditions.push(eq(schema.businesses.country, country as "BE" | "NL"));
  }
  if (province) {
    conditions.push(eq(schema.businesses.province, province));
  }
  if (status) {
    conditions.push(
      eq(
        schema.leadStatuses.status,
        status as "new" | "contacted" | "replied" | "meeting" | "won" | "lost" | "disqualified"
      )
    );
  }
  if (scoreMin) {
    conditions.push(gte(schema.leadScores.totalScore, parseInt(scoreMin, 10)));
  }
  if (scoreMax) {
    conditions.push(lte(schema.leadScores.totalScore, parseInt(scoreMax, 10)));
  }
  if (search) {
    conditions.push(
      or(
        ilike(schema.businesses.name, "%" + search + "%"),
        ilike(schema.businesses.city, "%" + search + "%")
      )
    );
  }
  if (naceCode) {
    conditions.push(eq(schema.businesses.naceCode, naceCode));
  }
  if (hasWebsite === "true") {
    conditions.push(isNotNull(schema.businesses.website));
  } else if (hasWebsite === "false") {
    conditions.push(isNull(schema.businesses.website));
  }

  const whereClause = and(...conditions);

  const sortDirection = order === "asc" ? asc : desc;
  let orderByColumn;
  switch (sort) {
    case "name":
      orderByColumn = sortDirection(schema.businesses.name);
      break;
    case "city":
      orderByColumn = sortDirection(schema.businesses.city);
      break;
    case "founded":
      orderByColumn = sortDirection(schema.businesses.foundedDate);
      break;
    case "recent":
      orderByColumn = sortDirection(schema.businesses.createdAt);
      break;
    case "score":
    default:
      orderByColumn = sortDirection(schema.leadScores.totalScore);
      break;
  }

  const [totalResult] = await db
    .select({ count: count() })
    .from(schema.businesses)
    .leftJoin(schema.leadScores, eq(schema.businesses.id, schema.leadScores.businessId))
    .leftJoin(schema.leadStatuses, eq(schema.businesses.id, schema.leadStatuses.businessId))
    .where(whereClause);

  const total = totalResult.count;
  const totalPages = Math.ceil(total / limit);

  const data = await db
    .select({
      business: schema.businesses,
      score: schema.leadScores,
      status: schema.leadStatuses,
      audit: schema.auditResults,
    })
    .from(schema.businesses)
    .leftJoin(schema.leadScores, eq(schema.businesses.id, schema.leadScores.businessId))
    .leftJoin(schema.leadStatuses, eq(schema.businesses.id, schema.leadStatuses.businessId))
    .leftJoin(schema.auditResults, eq(schema.businesses.id, schema.auditResults.businessId))
    .where(whereClause)
    .orderBy(orderByColumn)
    .limit(limit)
    .offset(offset);

  const filterParams: Record<string, string> = {};
  if (country) filterParams.country = country;
  if (province) filterParams.province = province;
  if (status) filterParams.status = status;
  if (scoreMin) filterParams.scoreMin = scoreMin;
  if (scoreMax) filterParams.scoreMax = scoreMax;
  if (search) filterParams.search = search;
  if (naceCode) filterParams.naceCode = naceCode;
  if (hasWebsite) filterParams.hasWebsite = hasWebsite;
  if (sort && sort !== "score") filterParams.sort = sort;
  if (order && order !== "desc") filterParams.order = order;

  function getStatusOption(value: string | undefined) {
    if (!value) return null;
    return LEAD_STATUS_OPTIONS.find((s) => s.value === value) ?? null;
  }

  function getPagespeedColor(score: number | null) {
    if (score === null) return "text-muted";
    if (score >= 90) return "text-green-600";
    if (score >= 50) return "text-amber-600";
    return "text-red-600";
  }

  const exportParams = new URLSearchParams(filterParams);
  const exportUrl = "/api/export?" + exportParams.toString();

  return (
    <div>
      <Header
        title="Leads"
        description={formatNumber(total) + " leads gevonden"}
        actions={
          <div className="flex items-center gap-2">
            <SmartImportButton />
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
          country,
          province,
          status,
          scoreMin,
          scoreMax,
          search,
          naceCode,
          hasWebsite,
          sort,
          order,
        }}
      />

      <Card>
        <div className="overflow-x-auto -mx-6 -mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-card-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Score</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Naam</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Locatie</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Website</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">PageSpeed</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Opgericht</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted">
                    Geen leads gevonden
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
                        <ScoreBadge score={row.score?.totalScore ?? null} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={"/leads/" + row.business.id}
                          className="font-medium text-foreground hover:text-accent transition-colors"
                        >
                          {row.business.name}
                        </Link>
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
                        <span className={"font-medium " + getPagespeedColor(row.audit?.pagespeedMobileScore ?? null)}>
                          {row.audit?.pagespeedMobileScore != null
                            ? row.audit.pagespeedMobileScore
                            : "\u2014"}
                        </span>
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
                      <td className="px-4 py-3 text-muted">
                        {formatDate(row.business.foundedDate)}
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
    </div>
  );
}
