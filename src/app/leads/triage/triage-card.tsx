"use client";

import { Check, X, SkipForward, Loader2 } from "lucide-react";
import Link from "next/link";
import { ScoreBadge } from "@/components/leads/score-badge";
import { Card } from "@/components/ui/card";
import { ContactEditor } from "@/app/leads/[id]/contact-editor";
import type * as schema from "@/lib/db/schema";

// Query output shape — matcht fetchColdLeads() return type
export interface TriageLead {
  business: typeof schema.businesses.$inferSelect;
  score: typeof schema.leadScores.$inferSelect | null;
  status: typeof schema.leadStatuses.$inferSelect | null;
  audit: typeof schema.auditResults.$inferSelect | null;
}

interface TriageCardProps {
  lead: TriageLead;
  onPromote: () => void;
  onSkip: () => void;
  onBlacklist: () => void;
  busy: boolean;
}

function getAuditScore(audit: TriageLead["audit"]): number | null {
  if (!audit) return null;
  // Pak de hoogste van mobile/desktop als representatieve audit-score
  const mobile = audit.pagespeedMobileScore;
  const desktop = audit.pagespeedDesktopScore;
  if (mobile === null && desktop === null) return null;
  return Math.max(mobile ?? 0, desktop ?? 0);
}

function formatDate(date: Date | null | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });
}

interface BreakdownEntry {
  points: number;
  reason: string;
  dimension: string;
}

function aggregateByDimension(
  breakdown: Record<string, BreakdownEntry>
): Array<{ dimension: string; total: number; reasons: BreakdownEntry[] }> {
  const map = new Map<string, { total: number; reasons: BreakdownEntry[] }>();
  for (const entry of Object.values(breakdown)) {
    if (!entry || typeof entry !== "object" || typeof entry.points !== "number") continue;
    const existing = map.get(entry.dimension) ?? { total: 0, reasons: [] };
    existing.total += entry.points;
    existing.reasons.push(entry);
    map.set(entry.dimension, existing);
  }
  return Array.from(map.entries())
    .map(([dimension, data]) => ({ dimension, ...data }))
    .sort((a, b) => b.total - a.total);
}

export function TriageCard({ lead, onPromote, onSkip, onBlacklist, busy }: TriageCardProps) {
  const { business, score, audit } = lead;
  const auditScore = getAuditScore(audit);
  const rawBreakdown = (score?.scoreBreakdown ?? {}) as Record<string, BreakdownEntry>;
  const dimensionGroups = aggregateByDimension(rawBreakdown);

  return (
    <Card className="p-8 md:p-10">
      {/* Business header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            {business.name}
          </h1>
          <Link
            href={`/leads/${business.id}`}
            target="_blank"
            className="shrink-0 text-xs text-muted hover:text-foreground transition-colors"
          >
            Open details ↗
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {business.sector && <span className="capitalize">{business.sector}</span>}
          {business.sector && (business.city || business.province) && <span>·</span>}
          {business.city && <span>{business.city}</span>}
          {business.province && (
            <>
              {business.city && <span>,</span>}
              <span>{business.province}</span>
            </>
          )}
          {business.chainWarning && (
            <span
              className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700"
              title={business.chainWarning}
            >
              Mogelijk keten
            </span>
          )}
        </div>
      </div>

      {/* Score + Audit grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* Lead Score box */}
        <div className="rounded-xl border border-card-border bg-gray-50/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Lead Score
            </span>
            <ScoreBadge score={score?.totalScore ?? null} size="md" />
          </div>
          {dimensionGroups.length > 0 ? (
            <div className="space-y-2.5">
              {dimensionGroups.map(({ dimension, total, reasons }) => (
                <div key={dimension}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-foreground capitalize">{dimension}</span>
                    <span
                      className={
                        "font-semibold " +
                        (total > 0 ? "text-green-600" : total < 0 ? "text-red-500" : "text-muted")
                      }
                    >
                      {total > 0 ? "+" : ""}
                      {total}
                    </span>
                  </div>
                  <ul className="space-y-0.5 pl-2">
                    {reasons.map((r, i) => (
                      <li key={i} className="flex items-start justify-between gap-2 text-[11px] text-muted">
                        <span className="truncate">{r.reason}</span>
                        <span className="shrink-0 tabular-nums">
                          {r.points > 0 ? "+" : ""}
                          {r.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted italic">Geen breakdown beschikbaar</p>
          )}
          {score?.maturityCluster && (
            <div className="mt-3 pt-3 border-t border-card-border">
              <span className="text-xs text-muted">
                Cluster: <span className="font-medium text-foreground">{score.maturityCluster}</span>
              </span>
            </div>
          )}
        </div>

        {/* Audit box */}
        <div className="rounded-xl border border-card-border bg-gray-50/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Website Audit
            </span>
            {auditScore !== null ? (
              <ScoreBadge score={auditScore} size="md" />
            ) : (
              <span className="text-xs text-muted italic">Geen audit</span>
            )}
          </div>
          {audit ? (
            <div className="space-y-1.5">
              {audit.pagespeedMobileScore !== null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Mobile PageSpeed</span>
                  <span className="font-medium text-foreground">{audit.pagespeedMobileScore}</span>
                </div>
              )}
              {audit.pagespeedDesktopScore !== null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Desktop PageSpeed</span>
                  <span className="font-medium text-foreground">{audit.pagespeedDesktopScore}</span>
                </div>
              )}
              {audit.hasSsl !== null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">SSL</span>
                  <span className="font-medium text-foreground">{audit.hasSsl ? "✓" : "✗"}</span>
                </div>
              )}
              {audit.isMobileResponsive !== null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Mobile responsive</span>
                  <span className="font-medium text-foreground">{audit.isMobileResponsive ? "✓" : "✗"}</span>
                </div>
              )}
              {audit.detectedCms && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">CMS</span>
                  <span className="font-medium text-foreground capitalize">{audit.detectedCms}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted italic">Nog geen audit uitgevoerd</p>
          )}
        </div>
      </div>

      {/* Contact sectie met inline edit + add buttons */}
      <div className="mb-8 rounded-xl border border-card-border bg-gray-50/40 p-5">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
          Contact
        </h2>
        <ContactEditor
          leadId={business.id}
          email={business.email}
          phone={business.phone}
          website={business.website}
          facebook={business.facebook}
        />
      </div>

      {/* Meta info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-6 mb-8 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted shrink-0 w-28">Geïmporteerd:</span>
          <span className="text-foreground">{formatDate(business.createdAt)}</span>
        </div>
        {business.naceCode && (
          <div className="flex items-center gap-2">
            <span className="text-muted shrink-0 w-28">NACE-code:</span>
            <span className="text-foreground">
              {business.naceCode}
              {business.naceDescription && (
                <span className="text-muted ml-1">· {business.naceDescription}</span>
              )}
            </span>
          </div>
        )}
        {business.googleRating !== null && (
          <div className="flex items-center gap-2">
            <span className="text-muted shrink-0 w-28">Google rating:</span>
            <span className="text-foreground">
              {business.googleRating} ★
              {business.googleReviewCount !== null && (
                <span className="text-muted ml-1">({business.googleReviewCount} reviews)</span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={onPromote}
          disabled={busy}
          className="group flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-300 px-6 py-5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? (
            <Loader2 className="h-6 w-6 text-green-600 animate-spin" />
          ) : (
            <Check className="h-6 w-6 text-green-600" />
          )}
          <span className="text-sm font-semibold text-green-700">
            Promote <span className="text-xs opacity-70">(e)</span>
          </span>
        </button>
        <button
          onClick={onSkip}
          disabled={busy}
          className="group flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 px-6 py-5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SkipForward className="h-6 w-6 text-gray-600" />
          <span className="text-sm font-semibold text-gray-700">
            Skip <span className="text-xs opacity-70">(s)</span>
          </span>
        </button>
        <button
          onClick={onBlacklist}
          disabled={busy}
          className="group flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300 px-6 py-5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X className="h-6 w-6 text-red-600" />
          <span className="text-sm font-semibold text-red-700">
            Blacklist <span className="text-xs opacity-70">(x)</span>
          </span>
        </button>
      </div>
    </Card>
  );
}
