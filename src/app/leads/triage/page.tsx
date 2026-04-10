export const dynamic = 'force-dynamic';

import Link from "next/link";
import { ArrowLeft, Inbox } from "lucide-react";
import { fetchColdLeads, serializeColdLeadFilters, type ColdLeadFilters } from "@/lib/db/queries/cold-leads";
import { TriageWorkspace } from "./triage-workspace";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Triage-queue heeft een maximum om een initial fetch snel te houden.
// Voor 500+ leads moet je filteren om de queue werkbaar te houden.
const TRIAGE_QUEUE_LIMIT = 500;

export default async function TriagePage({ searchParams }: PageProps) {
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

  const data = await fetchColdLeads(filters, { limit: TRIAGE_QUEUE_LIMIT, offset: 0 });

  const backUrl = "/leads?" + new URLSearchParams(serializeColdLeadFilters(filters)).toString();

  if (data.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <Link
            href={backUrl}
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Terug naar leads
          </Link>
        </div>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Inbox className="h-12 w-12 text-muted mb-4" />
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Geen leads om te triagen
          </h1>
          <p className="text-sm text-muted max-w-md">
            De huidige filters leveren geen cold leads op. Pas je filters aan op de leads-pagina en probeer opnieuw.
          </p>
          <Link
            href={backUrl}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Terug naar leads
          </Link>
        </div>
      </div>
    );
  }

  return (
    <TriageWorkspace
      initialQueue={data}
      backUrl={backUrl}
      queueLimitReached={data.length >= TRIAGE_QUEUE_LIMIT}
    />
  );
}
