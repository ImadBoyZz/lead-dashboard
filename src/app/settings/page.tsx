export const dynamic = 'force-dynamic';

import { desc, count } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { GdprOptOut } from "./gdpr-opt-out";
import {
  Database,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

export default async function SettingsPage() {
  // Fetch import logs
  const imports = await db
    .select()
    .from(schema.importLogs)
    .orderBy(desc(schema.importLogs.startedAt))
    .limit(20);

  // Fetch system stats
  const [totalBusinesses] = await db
    .select({ count: count() })
    .from(schema.businesses);

  const [totalAudited] = await db
    .select({ count: count() })
    .from(schema.auditResults);

  const lastImport = imports.length > 0 ? imports[0] : null;

  function getImportStatusBadge(status: string) {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-0.5 bg-green-50 text-green-700">
            <CheckCircle2 className="h-3 w-3" />
            Voltooid
          </span>
        );
      case "running":
        return (
          <span className="inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-0.5 bg-blue-50 text-blue-700">
            <Loader2 className="h-3 w-3 animate-spin" />
            Bezig
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-0.5 bg-red-50 text-red-700">
            <XCircle className="h-3 w-3" />
            Mislukt
          </span>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  }

  function getSourceLabel(source: string) {
    switch (source) {
      case "google_places":
        return "Google Places";
      case "manual":
        return "Manueel";
      default:
        return source;
    }
  }

  return (
    <div>
      <Header title="Instellingen" />

      <div className="space-y-6">
        {/* Import Status */}
        <Card title="Import Status" description="Overzicht van alle data imports">
          {imports.length === 0 ? (
            <p className="text-sm text-muted">Nog geen imports uitgevoerd</p>
          ) : (
            <div className="overflow-x-auto -mx-6 -mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-card-border">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                      Bron
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                      Totaal
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                      Nieuw
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                      Bijgewerkt
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                      Fouten
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                      Gestart
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                      Voltooid
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {imports.map((imp) => (
                    <tr key={imp.id} className="hover:bg-gray-50/40">
                      <td className="px-4 py-2.5 font-medium">
                        {getSourceLabel(imp.source)}
                      </td>
                      <td className="px-4 py-2.5">
                        {getImportStatusBadge(imp.status)}
                      </td>
                      <td className="px-4 py-2.5">{imp.totalRecords ?? 0}</td>
                      <td className="px-4 py-2.5">{imp.newRecords ?? 0}</td>
                      <td className="px-4 py-2.5">{imp.updatedRecords ?? 0}</td>
                      <td className="px-4 py-2.5">
                        {(imp.errorCount ?? 0) > 0 ? (
                          <span className="text-red-600 font-medium">{imp.errorCount}</span>
                        ) : (
                          0
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {formatDate(imp.startedAt)}
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {imp.completedAt ? formatDate(imp.completedAt) : "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* GDPR */}
        <Card title="GDPR" description="Beheer opt-out verzoeken van bedrijven">
          <GdprOptOut />
        </Card>

        {/* Systeem Info */}
        <Card title="Systeem Info">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Database verbonden</p>
                <p className="text-xs text-muted">Neon PostgreSQL</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-card-border">
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {totalBusinesses.count}
                </p>
                <p className="text-xs text-muted">Totaal bedrijven</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {totalAudited.count}
                </p>
                <p className="text-xs text-muted">Geaudit</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {lastImport ? formatDate(lastImport.startedAt) : "\u2014"}
                </p>
                <p className="text-xs text-muted">Laatste import</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
