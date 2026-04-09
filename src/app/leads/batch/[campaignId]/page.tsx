import Link from "next/link";
import { ChevronRight, ArrowLeft } from "lucide-react";
import { DraftApprovalBoard } from "@/components/ai/draft-approval-board";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function BatchApprovalPage({ params }: PageProps) {
  const { campaignId } = await params;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted">
        <Link href="/leads" className="hover:text-foreground transition-colors">
          Leads
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span>Batch Outreach</span>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">Campagne</span>
      </nav>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Batch Outreach Goedkeuring</h1>
          <p className="text-sm text-muted mt-1">
            Bekijk, bewerk en keur de gegenereerde berichten goed voordat je ze verstuurt.
          </p>
        </div>
        <Link
          href="/warm"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-card-border hover:bg-gray-50 transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar Warm Leads
        </Link>
      </div>

      <DraftApprovalBoard campaignId={campaignId} />
    </div>
  );
}
