import { eq, and, or, desc, asc, ilike, gte, lte, isNull, isNotNull, count } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export interface ColdLeadFilters {
  country?: string;
  province?: string;
  status?: string;
  sector?: string;
  search?: string;
  naceCode?: string;
  hasWebsite?: string;
  imported?: string;
  sort?: string;
  order?: string;
}

/**
 * Bouwt de WHERE-clauses voor een cold leads query.
 * Gedeeld tussen de cold leads tabel en de triage mode, zodat filter-logica
 * nooit uit sync kan lopen.
 */
export function buildColdLeadsWhere(filters: ColdLeadFilters) {
  const conditions = [];
  conditions.push(eq(schema.businesses.optOut, false));
  conditions.push(eq(schema.businesses.blacklisted, false));
  conditions.push(eq(schema.businesses.leadTemperature, 'cold'));

  if (filters.country) {
    conditions.push(eq(schema.businesses.country, filters.country as "BE" | "NL"));
  }
  if (filters.province) {
    conditions.push(eq(schema.businesses.province, filters.province));
  }
  if (filters.status) {
    conditions.push(
      eq(
        schema.leadStatuses.status,
        filters.status as "new" | "contacted" | "replied" | "meeting" | "won" | "lost" | "disqualified"
      )
    );
  }
  if (filters.sector) {
    conditions.push(eq(schema.businesses.sector, filters.sector));
  }
  if (filters.imported) {
    const now = new Date();
    let since: Date;
    if (filters.imported === "today") {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      conditions.push(gte(schema.businesses.createdAt, since));
    } else if (filters.imported === "week") {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      conditions.push(gte(schema.businesses.createdAt, since));
    } else if (filters.imported === "month") {
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      conditions.push(gte(schema.businesses.createdAt, since));
    } else if (filters.imported === "older") {
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      conditions.push(lte(schema.businesses.createdAt, since));
    }
  }
  if (filters.search) {
    conditions.push(
      or(
        ilike(schema.businesses.name, "%" + filters.search + "%"),
        ilike(schema.businesses.city, "%" + filters.search + "%")
      )
    );
  }
  if (filters.naceCode) {
    conditions.push(eq(schema.businesses.naceCode, filters.naceCode));
  }
  if (filters.hasWebsite === "true") {
    conditions.push(isNotNull(schema.businesses.website));
  } else if (filters.hasWebsite === "false") {
    conditions.push(isNull(schema.businesses.website));
  }

  return and(...conditions);
}

/**
 * Bepaalt de orderBy column voor cold leads op basis van sort/order filters.
 */
export function buildColdLeadsOrderBy(sort: string | undefined, order: string | undefined) {
  const effectiveSort = sort || "recent";
  const effectiveOrder = order || (effectiveSort === "score" ? "desc" : "asc");
  const sortDirection = effectiveOrder === "asc" ? asc : desc;

  switch (effectiveSort) {
    case "name":
      return sortDirection(schema.businesses.name);
    case "city":
      return sortDirection(schema.businesses.city);
    case "founded":
      return sortDirection(schema.businesses.foundedDate);
    case "recent":
      return sortDirection(schema.businesses.createdAt);
    case "score":
    default:
      return sortDirection(schema.leadScores.totalScore);
  }
}

/**
 * Telt het totaal aantal cold leads dat aan de filters voldoet.
 * Gebruikt voor de "Start Triage (X)" knop en paginering.
 */
export async function countColdLeads(filters: ColdLeadFilters): Promise<number> {
  const whereClause = buildColdLeadsWhere(filters);
  const [result] = await db
    .select({ count: count() })
    .from(schema.businesses)
    .leftJoin(schema.leadScores, eq(schema.businesses.id, schema.leadScores.businessId))
    .leftJoin(schema.leadStatuses, eq(schema.businesses.id, schema.leadStatuses.businessId))
    .where(whereClause);
  return result.count;
}

/**
 * Haalt cold leads op met alle geojoinede metadata (score, status, audit).
 * Gedeeld tussen de tabel en triage queue.
 */
export async function fetchColdLeads(
  filters: ColdLeadFilters,
  pagination?: { limit: number; offset: number }
) {
  const whereClause = buildColdLeadsWhere(filters);
  const orderByColumn = buildColdLeadsOrderBy(filters.sort, filters.order);

  let query = db
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
    .$dynamic();

  if (pagination) {
    query = query.limit(pagination.limit).offset(pagination.offset);
  }

  return await query;
}

/**
 * Serialiseert filter-state terug naar URLSearchParams-compatible object.
 * Gebruikt voor pagination hrefs en voor de "Start Triage" link.
 */
export function serializeColdLeadFilters(filters: ColdLeadFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.country) params.country = filters.country;
  if (filters.province) params.province = filters.province;
  if (filters.status) params.status = filters.status;
  if (filters.sector) params.sector = filters.sector;
  if (filters.search) params.search = filters.search;
  if (filters.naceCode) params.naceCode = filters.naceCode;
  if (filters.hasWebsite) params.hasWebsite = filters.hasWebsite;
  if (filters.imported) params.imported = filters.imported;
  if (filters.sort && filters.sort !== "recent") params.sort = filters.sort;
  if (filters.order && filters.order !== "desc") params.order = filters.order;
  return params;
}
