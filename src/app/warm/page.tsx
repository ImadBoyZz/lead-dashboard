export const dynamic = 'force-dynamic';

import Link from "next/link";
import { Globe, ArrowUpRight } from "lucide-react";
import { eq, and, desc, count, ilike, or, isNull, isNotNull, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import { WarmLeadActions } from "./warm-lead-actions";
import { WarmLeadFilters } from "./warm-lead-filters";
import { StatusSwitcher } from "./status-switcher";
import { Pagination } from "@/components/ui/pagination";
import { ITEMS_PER_PAGE } from "@/lib/constants";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WarmLeadsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const sector = (params.sector as string) || undefined;
  const status = (params.status as string) || undefined;
  const hasWebsite = (params.hasWebsite as string) || undefined;
  const province = (params.province as string) || undefined;
  const search = (params.search as string) || undefined;
  const page = Math.max(1, parseInt((params.page as string) || "1", 10));
  const limit = ITEMS_PER_PAGE;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(schema.businesses.optOut, false),
    eq(schema.businesses.blacklisted, false),
    eq(schema.businesses.leadTemperature, 'warm'),
    or(
      eq(schema.leadStatuses.status, 'new'),
      isNull(schema.leadStatuses.status),
    )!,
  ];

  if (sector) {
    conditions.push(eq(schema.businesses.sector, sector));
  }
  if (search) {
    conditions.push(
      or(
        ilike(schema.businesses.name, "%" + search + "%"),
        ilike(schema.businesses.city, "%" + search + "%"),
      )!,
    );
  }
  if (hasWebsite === "true") {
    conditions.push(isNotNull(schema.businesses.website));
  } else if (hasWebsite === "false") {
    conditions.push(isNull(schema.businesses.website));
  }
  if (province) {
    // Match on province field OR city (province is often null for Google Places data)
    const provinceCities: Record<string, string[]> = {
      'Oost-Vlaanderen': ['Aalst', 'Gent', 'Dendermonde', 'Sint-Niklaas', 'Lokeren', 'Wetteren', 'Ninove', 'Zele', 'Hamme', 'Geraardsbergen', 'Ronse', 'Zottegem', 'Oudenaarde', 'Eeklo', 'Deinze', 'Temse', 'Beveren', 'Kruibeke', 'Waasmunster'],
      'West-Vlaanderen': ['Brugge', 'Kortrijk', 'Oostende', 'Roeselare', 'Ieper', 'Waregem', 'Knokke-Heist', 'Blankenberge', 'Torhout', 'Diksmuide', 'Poperinge', 'Menen', 'Harelbeke', 'Izegem', 'Tielt'],
      'Antwerpen': ['Antwerpen', 'Mechelen', 'Turnhout', 'Lier', 'Herentals', 'Mol', 'Geel', 'Boom', 'Brasschaat', 'Schoten', 'Mortsel', 'Edegem', 'Kontich', 'Wilrijk', 'Berchem', 'Hoboken', 'Deurne', 'Borgerhout', 'Merksem', 'Ekeren'],
      'Limburg': ['Hasselt', 'Genk', 'Sint-Truiden', 'Tongeren', 'Beringen', 'Lommel', 'Maaseik', 'Maasmechelen', 'Diepenbeek', 'Bilzen', 'Leopoldsburg'],
      'Vlaams-Brabant': ['Leuven', 'Vilvoorde', 'Halle', 'Aarschot', 'Tienen', 'Diest', 'Zaventem', 'Grimbergen', 'Machelen', 'Overijse', 'Tervuren'],
      'Brussel': ['Brussel', 'Brussels', 'Bruxelles', 'Schaarbeek', 'Anderlecht', 'Molenbeek', 'Elsene', 'Ixelles', 'Etterbeek', 'Sint-Gillis', 'Ukkel', 'Vorst', 'Jette', 'Ganshoren', 'Koekelberg', 'Sint-Jans-Molenbeek', 'Sint-Joost-ten-Node', 'Watermaal-Bosvoorde', 'Oudergem', 'Sint-Lambrechts-Woluwe', 'Sint-Pieters-Woluwe', 'Evere', 'Haren', 'Neder-Over-Heembeek'],
    };
    const cities = provinceCities[province] ?? [];
    conditions.push(
      or(
        eq(schema.businesses.province, province),
        ...(cities.length > 0 ? [inArray(schema.businesses.city, cities)] : []),
      )!,
    );
  }
  if (status) {
    conditions.push(
      eq(
        schema.leadStatuses.status,
        status as "new" | "contacted" | "replied" | "meeting" | "won" | "lost" | "disqualified",
      ),
    );
  }

  const whereClause = and(...conditions);

  const [totalResult] = await db
    .select({ count: count() })
    .from(schema.businesses)
    .leftJoin(schema.leadStatuses, eq(schema.businesses.id, schema.leadStatuses.businessId))
    .where(whereClause);

  const data = await db
    .select({
      business: schema.businesses,
      status: schema.leadStatuses,
    })
    .from(schema.businesses)
    .leftJoin(schema.leadStatuses, eq(schema.businesses.id, schema.leadStatuses.businessId))
    .where(whereClause)
    .orderBy(desc(schema.businesses.updatedAt))
    .limit(limit)
    .offset(offset);

  return (
    <div>
      <Header
        title="Warm Leads"
        description={formatNumber(totalResult.count) + " leads gefilterd"}
      />

      <WarmLeadFilters
        filters={{ sector, status, hasWebsite, province, search }}
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
                    Geen warm leads gevonden met deze filters
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
                        <StatusSwitcher
                          leadId={row.business.id}
                          leadName={row.business.name}
                          currentStatus={row.status?.status}
                        />
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

      <Pagination
        currentPage={page}
        totalPages={Math.ceil(totalResult.count / limit)}
        basePath="/warm"
        searchParams={Object.fromEntries(
          Object.entries({ sector, status, hasWebsite, province, search })
            .filter(([, v]) => v !== undefined) as [string, string][]
        )}
      />
    </div>
  );
}
