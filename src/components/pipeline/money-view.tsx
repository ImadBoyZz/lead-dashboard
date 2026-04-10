"use client";

import Link from "next/link";
import { Euro, TrendingUp } from "lucide-react";
import type { PipelineLeadRow } from "./pipeline-tabs";
import { expectedValue, STAGE_PROBABILITY } from "@/lib/pipeline/stage-probability";
import { PIPELINE_STAGE_OPTIONS } from "@/lib/constants";
import { StaleBadge } from "./stale-badge";

interface MoneyViewProps {
  leads: PipelineLeadRow[];
}

export function MoneyView({ leads }: MoneyViewProps) {
  // Alleen actieve leads met dealValue > 0. Won/ignored/frozen vallen af.
  const ranked = leads
    .filter(
      (l) =>
        !l.frozen &&
        l.stage !== "won" &&
        l.stage !== "ignored" &&
        (l.dealValue ?? 0) > 0
    )
    .map((lead) => ({
      lead,
      expected: expectedValue(lead.dealValue, lead.stage),
    }))
    .sort((a, b) => b.expected - a.expected);

  const totalExpected = ranked.reduce((sum, r) => sum + r.expected, 0);
  const totalRaw = ranked.reduce((sum, r) => sum + (r.lead.dealValue ?? 0), 0);

  // Won totaal deze periode (historische revenue)
  const wonValue = leads
    .filter((l) => l.stage === "won")
    .reduce((sum, l) => sum + (l.wonValue ?? l.dealValue ?? 0), 0);

  return (
    <div className="mt-6 space-y-4">
      {/* Money bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-green-700">
            <TrendingUp className="h-3.5 w-3.5" />
            Verwacht (weighted)
          </div>
          <div className="mt-1 text-2xl font-bold text-green-900">
            €{Math.round(totalExpected).toLocaleString("nl-BE")}
          </div>
          <div className="text-[11px] text-green-700/70">
            op {ranked.length} deal{ranked.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
            <Euro className="h-3.5 w-3.5" />
            Totaal in pipeline (raw)
          </div>
          <div className="mt-1 text-2xl font-bold text-blue-900">
            €{Math.round(totalRaw).toLocaleString("nl-BE")}
          </div>
          <div className="text-[11px] text-blue-700/70">niet gewogen</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            <Euro className="h-3.5 w-3.5" />
            Gewonnen
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-900">
            €{Math.round(wonValue).toLocaleString("nl-BE")}
          </div>
          <div className="text-[11px] text-emerald-700/70">historisch</div>
        </div>
      </div>

      {ranked.length === 0 ? (
        <div className="rounded-xl border border-dashed border-card-border bg-gray-50/50 p-12 text-center">
          <p className="text-sm font-semibold text-foreground">
            Geen deals met dealwaarde ingesteld
          </p>
          <p className="mt-1 text-xs text-muted">
            Vul dealValue in bij leads in stages &apos;gecontacteerd&apos;,
            &apos;offerte verstuurd&apos; of &apos;afspraak&apos; om ze hier te zien.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-card-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-card-border text-left text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Bedrijf</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3 text-right">Dealwaarde</th>
                <th className="px-4 py-3 text-right">Kans</th>
                <th className="px-4 py-3 text-right">Verwacht</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {ranked.map(({ lead, expected }, idx) => {
                const stage = PIPELINE_STAGE_OPTIONS.find(
                  (s) => s.value === lead.stage
                );
                const probability = STAGE_PROBABILITY[lead.stage] ?? 0;
                return (
                  <tr
                    key={lead.pipelineId}
                    className="transition-colors hover:bg-blue-50/40"
                  >
                    <td className="px-4 py-3 text-xs font-bold text-muted">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/leads/${lead.businessId}`}
                        className="text-sm font-medium text-foreground hover:text-accent"
                      >
                        {lead.name}
                      </Link>
                      <div className="text-xs text-muted">{lead.city ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${stage?.color ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {stage?.label ?? lead.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-foreground">
                      €{(lead.dealValue ?? 0).toLocaleString("nl-BE")}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted">
                      {Math.round(probability * 100)}%
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-700">
                      €{Math.round(expected).toLocaleString("nl-BE")}
                    </td>
                    <td className="px-4 py-3">
                      <StaleBadge stageChangedAt={lead.stageChangedAt} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
