export const dynamic = 'force-dynamic';

import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Globe,
  Mail,
  Phone,
  Star,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Building2,
  MapPin,
  Calendar,
} from "lucide-react";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate, getYearsInBusiness } from "@/lib/utils";
import { getScoreColor, getScoreLabel } from "@/lib/scoring";
import { LEAD_STATUS_OPTIONS } from "@/lib/constants";
import { OutreachTimeline } from "@/components/outreach/outreach-timeline";
import { OutreachForm } from "@/components/outreach/outreach-form";
import { ReminderForm } from "@/components/reminders/reminder-form";
import { StatusChanger } from "./status-changer";
import { AddNote } from "./add-note";
import { CopyButton } from "./copy-button";
import { ScanButton } from "./scan-button";
import type { ScoreBreakdown } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;

  // Fetch business with joins
  const [result] = await db
    .select({
      business: schema.businesses,
      audit: schema.auditResults,
      score: schema.leadScores,
      status: schema.leadStatuses,
    })
    .from(schema.businesses)
    .leftJoin(
      schema.auditResults,
      eq(schema.businesses.id, schema.auditResults.businessId)
    )
    .leftJoin(
      schema.leadScores,
      eq(schema.businesses.id, schema.leadScores.businessId)
    )
    .leftJoin(
      schema.leadStatuses,
      eq(schema.businesses.id, schema.leadStatuses.businessId)
    )
    .where(eq(schema.businesses.id, id))
    .limit(1);

  if (!result) {
    notFound();
  }

  const { business, audit, score, status } = result;

  // Fetch notes
  const leadNotes = await db
    .select()
    .from(schema.notes)
    .where(eq(schema.notes.businessId, id))
    .orderBy(desc(schema.notes.createdAt));

  // Fetch status history
  const history = await db
    .select()
    .from(schema.statusHistory)
    .where(eq(schema.statusHistory.businessId, id))
    .orderBy(desc(schema.statusHistory.changedAt));

  const countryFlag = business.country === "BE" ? "\u{1F1E7}\u{1F1EA}" : "\u{1F1F3}\u{1F1F1}";
  const yearsInBusiness = getYearsInBusiness(business.foundedDate);
  const currentStatus = status?.status ?? "new";

  const scoreBreakdown = (score?.scoreBreakdown ?? {}) as ScoreBreakdown;

  function getStatusLabel(value: string) {
    return LEAD_STATUS_OPTIONS.find((s) => s.value === value)?.label ?? value;
  }

  function getStatusColor(value: string) {
    return LEAD_STATUS_OPTIONS.find((s) => s.value === value)?.color ?? "bg-gray-100 text-gray-700";
  }

  function getPagespeedColor(val: number | null) {
    if (val === null) return "bg-gray-200";
    if (val >= 90) return "bg-green-500";
    if (val >= 50) return "bg-amber-500";
    return "bg-red-500";
  }

  function getPagespeedTextColor(val: number | null) {
    if (val === null) return "text-muted";
    if (val >= 90) return "text-green-600";
    if (val >= 50) return "text-amber-600";
    return "text-red-600";
  }

  function BooleanIndicator({ value, label }: { value: boolean | null; label: string }) {
    return (
      <div className="flex items-center gap-2">
        {value ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-400" />
        )}
        <span className="text-sm">{label}</span>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar leads
        </Link>
      </div>

      <Header title={business.name} description={business.registryId + " \u00B7 " + (business.legalForm ?? "Onbekend")} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Bedrijfsinfo */}
          <Card title="Bedrijfsinfo">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p>{business.street ? business.street + " " + (business.houseNumber ?? "") : "\u2014"}</p>
                    <p>{business.postalCode ? business.postalCode + " " + (business.city ?? "") : business.city ?? "\u2014"}</p>
                    <p>{business.province ?? ""} {countryFlag}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted shrink-0" />
                  <span className="text-sm">
                    {business.naceCode ? business.naceCode + " \u2014 " + (business.naceDescription ?? "") : "Geen NACE code"}
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted shrink-0" />
                  <span className="text-sm">
                    {business.foundedDate
                      ? formatDate(business.foundedDate) + (yearsInBusiness !== null ? " (" + yearsInBusiness + " jaar)" : "")
                      : "Onbekend"}
                  </span>
                </div>
                {business.googleRating !== null && (
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-400 fill-amber-400 shrink-0" />
                    <span className="text-sm">
                      {business.googleRating}/5
                      {business.googleReviewCount !== null && (
                        <span className="text-muted"> ({business.googleReviewCount} reviews)</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Contact */}
          <Card title="Contact">
            {!business.website && !business.email && !business.phone ? (
              <p className="text-sm text-muted">Geen contactgegevens gevonden</p>
            ) : (
              <div className="space-y-3">
                {business.website && (
                  <div className="flex items-center justify-between">
                    <a
                      href={business.website.startsWith("http") ? business.website : "https://" + business.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-accent hover:underline"
                    >
                      <Globe className="h-4 w-4" />
                      {business.website}
                      <ArrowUpRight className="h-3 w-3" />
                    </a>
                    <CopyButton text={business.website} />
                  </div>
                )}
                {business.email && (
                  <div className="flex items-center justify-between">
                    <a
                      href={"mailto:" + business.email}
                      className="inline-flex items-center gap-2 text-sm text-accent hover:underline"
                    >
                      <Mail className="h-4 w-4" />
                      {business.email}
                    </a>
                    <CopyButton text={business.email} />
                  </div>
                )}
                {business.phone && (
                  <div className="flex items-center justify-between">
                    <a
                      href={"tel:" + business.phone}
                      className="inline-flex items-center gap-2 text-sm text-accent hover:underline"
                    >
                      <Phone className="h-4 w-4" />
                      {business.phone}
                    </a>
                    <CopyButton text={business.phone} />
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Status & Pipeline */}
          <Card title="Status & Pipeline">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">Huidige status:</span>
                <span className={"inline-flex items-center rounded-full text-xs font-medium px-2.5 py-0.5 " + getStatusColor(currentStatus)}>
                  {getStatusLabel(currentStatus)}
                </span>
              </div>

              <StatusChanger leadId={id} currentStatus={currentStatus} />

              {history.length > 0 && (
                <div className="mt-4 pt-4 border-t border-card-border">
                  <h4 className="text-sm font-medium text-foreground mb-3">Status geschiedenis</h4>
                  <div className="space-y-3">
                    {history.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-3 text-sm">
                        <Clock className="h-3.5 w-3.5 text-muted shrink-0" />
                        <span className="text-muted">{formatDate(entry.changedAt)}</span>
                        {entry.fromStatus && (
                          <>
                            <span className={"inline-flex items-center rounded-full text-xs font-medium px-2 py-0.5 " + getStatusColor(entry.fromStatus)}>
                              {getStatusLabel(entry.fromStatus)}
                            </span>
                            <span className="text-muted">{"\u2192"}</span>
                          </>
                        )}
                        <span className={"inline-flex items-center rounded-full text-xs font-medium px-2 py-0.5 " + getStatusColor(entry.toStatus)}>
                          {getStatusLabel(entry.toStatus)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Notities */}
          <Card title="Notities">
            <div className="space-y-4">
              {leadNotes.length === 0 && (
                <p className="text-sm text-muted">Nog geen notities</p>
              )}
              {leadNotes.map((note) => (
                <div key={note.id} className="border-l-2 border-accent/30 pl-3 py-1">
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                  <p className="text-xs text-muted mt-1">{formatDate(note.createdAt)}</p>
                </div>
              ))}
              <div className="pt-2 border-t border-card-border">
                <AddNote leadId={id} />
              </div>
            </div>
          </Card>

          {/* Outreach */}
          <Card title="Outreach">
            <div className="space-y-4">
              <OutreachTimeline businessId={id} />
              <div className="pt-4 border-t border-card-border">
                <h4 className="text-sm font-medium text-foreground mb-3">Nieuwe outreach loggen</h4>
                <OutreachForm businessId={id} />
              </div>
            </div>
          </Card>

          {/* Reminders */}
          <Card title="Reminders">
            <ReminderForm businessId={id} />
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Scan Website */}
          <ScanButton businessId={business.id} hasWebsite={!!business.website} />

          {/* Score */}
          <Card title="Score">
            <div className="text-center mb-4">
              <span className={"text-5xl font-bold " + getScoreColor(score?.totalScore ?? 0).split(" ")[0]}>
                {score?.totalScore ?? 0}
              </span>
              <p className={"text-sm font-medium mt-1 " + getScoreColor(score?.totalScore ?? 0).split(" ")[0]}>
                {getScoreLabel(score?.totalScore ?? 0)}
              </p>
            </div>

            {Object.keys(scoreBreakdown).length > 0 && (
              <div className="space-y-2 pt-3 border-t border-card-border">
                <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">Breakdown</h4>
                {Object.entries(scoreBreakdown).map(([key, item]) => (
                  <div key={key} className="flex items-start gap-2 text-sm">
                    <span
                      className={"mt-1.5 h-2 w-2 rounded-full shrink-0 " + (item.points >= 0 ? "bg-green-500" : "bg-red-500")}
                    />
                    <span className="flex-1 text-foreground">{item.reason}</span>
                    <span className={"font-medium tabular-nums " + (item.points >= 0 ? "text-green-600" : "text-red-600")}>
                      {item.points > 0 ? "+" : ""}{item.points}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Audit Details */}
          <Card title="Audit Details">
            {!audit ? (
              <p className="text-sm text-muted">Geen audit data</p>
            ) : (
              <div className="space-y-5">
                {/* Snelheid */}
                <div>
                  <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Snelheid</h4>
                  <div className="space-y-2">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span>Mobiel</span>
                        <span className={"font-medium " + getPagespeedTextColor(audit.pagespeedMobileScore)}>
                          {audit.pagespeedMobileScore ?? "\u2014"}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={"h-full rounded-full transition-all " + getPagespeedColor(audit.pagespeedMobileScore)}
                          style={{ width: (audit.pagespeedMobileScore ?? 0) + "%" }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span>Desktop</span>
                        <span className={"font-medium " + getPagespeedTextColor(audit.pagespeedDesktopScore)}>
                          {audit.pagespeedDesktopScore ?? "\u2014"}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={"h-full rounded-full transition-all " + getPagespeedColor(audit.pagespeedDesktopScore)}
                          style={{ width: (audit.pagespeedDesktopScore ?? 0) + "%" }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Beveiliging */}
                <div>
                  <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Beveiliging</h4>
                  <BooleanIndicator value={audit.hasSsl} label={"SSL Certificaat" + (audit.sslIssuer ? " (" + audit.sslIssuer + ")" : "")} />
                  {audit.sslExpiry && (
                    <p className="text-xs text-muted ml-6 mt-0.5">Vervalt: {formatDate(audit.sslExpiry)}</p>
                  )}
                </div>

                {/* Mobiel */}
                <div>
                  <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Mobiel</h4>
                  <div className="space-y-1.5">
                    <BooleanIndicator value={audit.isMobileResponsive} label="Mobile Responsive" />
                    <BooleanIndicator value={audit.hasViewportMeta} label="Viewport Meta Tag" />
                  </div>
                </div>

                {/* Technologie */}
                <div>
                  <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Technologie</h4>
                  {audit.detectedCms ? (
                    <p className="text-sm">
                      {audit.detectedCms}{audit.cmsVersion ? " " + audit.cmsVersion : ""}
                    </p>
                  ) : (
                    <p className="text-sm text-muted">Geen CMS gedetecteerd</p>
                  )}
                  {audit.detectedTechnologies && Array.isArray(audit.detectedTechnologies) && (audit.detectedTechnologies as string[]).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(audit.detectedTechnologies as string[]).map((tech) => (
                        <Badge key={tech}>{tech}</Badge>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Analytics */}
                <div>
                  <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Analytics</h4>
                  <div className="space-y-1.5">
                    <BooleanIndicator value={audit.hasGoogleAnalytics} label="Google Analytics" />
                    <BooleanIndicator value={audit.hasGoogleTagManager} label="Google Tag Manager" />
                    <BooleanIndicator value={audit.hasFacebookPixel} label="Facebook Pixel" />
                  </div>
                </div>

                {/* SEO */}
                <div>
                  <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">SEO</h4>
                  <div className="space-y-1.5">
                    <BooleanIndicator value={audit.hasMetaDescription} label="Meta Description" />
                    <BooleanIndicator value={audit.hasOpenGraph} label="Open Graph Tags" />
                    <BooleanIndicator value={audit.hasStructuredData} label="Structured Data" />
                    <BooleanIndicator value={audit.hasCookieBanner} label="Cookie Banner" />
                  </div>
                </div>

                {/* Meta */}
                <div className="pt-3 border-t border-card-border text-xs text-muted">
                  <p>Laatst geaudit: {formatDate(audit.auditedAt)}</p>
                  <p>Audit versie: {audit.auditVersion}</p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

