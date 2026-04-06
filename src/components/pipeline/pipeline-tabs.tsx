"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Mail,
  Phone,
  ExternalLink,
  MessageCircle,
  Users,
  Search,
  Euro,
  RotateCcw,
  Calendar,
} from "lucide-react";
import { PIPELINE_STAGE_OPTIONS, OUTREACH_CHANNEL_OPTIONS } from "@/lib/constants";
import { DataTable } from "@/components/ui/data-table";
import { AppointmentsWeekView } from "./appointments-week-view";

// ── Types ─────────────────────────────────────────────

export interface PipelineLeadRow {
  pipelineId: string;
  businessId: string;
  name: string;
  city: string | null;
  sector: string | null;
  stage: string;
  priority: string;
  dealValue: number | null;
  wonValue: number | null;
  contactMethod: string | null;
  lastOutreachChannel: string | null;
  lastOutreachAt: Date | string | null;
  meetingAt: Date | string | null;
  stageChangedAt: Date | string;
  rejectionReason: string | null;
  estimatedCloseDate: string | null;
  nextFollowUpAt: Date | string | null;
}

// ── Tab config ────────────────────────────────────────

const TABS = [
  { value: "contacted", label: "Gecontacteerd" },
  { value: "meeting", label: "Afspraken" },
  { value: "quote_sent", label: "Offerte verstuurd" },
  { value: "won", label: "Gewonnen" },
  { value: "ignored", label: "Genegeerd" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

// ── Channel icon helper ───────────────────────────────

const channelIcons: Record<string, React.ReactNode> = {
  email: <Mail className="h-3.5 w-3.5" />,
  phone: <Phone className="h-3.5 w-3.5" />,
  linkedin: <ExternalLink className="h-3.5 w-3.5" />,
  whatsapp: <MessageCircle className="h-3.5 w-3.5" />,
  in_person: <Users className="h-3.5 w-3.5" />,
};

function ChannelBadge({ channel }: { channel: string | null }) {
  if (!channel) return <span className="text-xs text-muted">—</span>;
  const config = OUTREACH_CHANNEL_OPTIONS.find((o) => o.value === channel);
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground bg-gray-100 rounded-full px-2 py-0.5">
      {channelIcons[channel] ?? null}
      {config?.label ?? channel}
    </span>
  );
}

// ── Rejection reason labels ───────────────────────────

const REJECTION_LABELS: Record<string, string> = {
  no_budget: "Geen budget",
  no_interest: "Geen interesse",
  has_supplier: "Heeft leverancier",
  bad_timing: "Slecht moment",
  no_response: "Geen reactie",
  other: "Anders",
};

// ── Date formatter ────────────────────────────────────

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "short",
    year: undefined,
  });
}

function formatDateTime(d: Date | string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Main component ────────────────────────────────────

interface PipelineTabsProps {
  leads: PipelineLeadRow[];
  selectedStage?: string;
}

export function PipelineTabs({ leads, selectedStage }: PipelineTabsProps) {
  const [activeTab, setActiveTab] = useState<TabValue>(
    (selectedStage as TabValue) || "contacted"
  );

  // Sync with external selectedStage changes (from stats click)
  useEffect(() => {
    if (selectedStage) {
      const validTab = TABS.find((t) => t.value === selectedStage);
      if (validTab) {
        setActiveTab(validTab.value);
      }
    }
  }, [selectedStage]);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");

  // Filter leads by active tab + search + filters
  const filteredLeads = useMemo(() => {
    let result = leads.filter((l) => l.stage === activeTab);

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          (l.city?.toLowerCase().includes(q) ?? false)
      );
    }

    if (channelFilter) {
      result = result.filter((l) => l.lastOutreachChannel === channelFilter);
    }

    if (sectorFilter) {
      result = result.filter((l) => l.sector === sectorFilter);
    }

    return result;
  }, [leads, activeTab, search, channelFilter, sectorFilter]);

  // Get unique sectors for filter
  const sectors = useMemo(() => {
    const s = new Set(leads.filter((l) => l.stage === activeTab).map((l) => l.sector).filter(Boolean));
    return Array.from(s).sort() as string[];
  }, [leads, activeTab]);

  // Revenue total for won tab
  const totalRevenue = useMemo(() => {
    if (activeTab !== "won") return 0;
    return filteredLeads.reduce((sum, l) => sum + (l.wonValue ?? l.dealValue ?? 0), 0);
  }, [filteredLeads, activeTab]);

  // Meeting leads for week view
  const meetingLeads = useMemo(() => {
    if (activeTab !== "meeting") return [];
    return filteredLeads
      .filter((l) => l.meetingAt)
      .map((l) => ({
        businessId: l.businessId,
        name: l.name,
        meetingAt: new Date(l.meetingAt!),
      }));
  }, [filteredLeads, activeTab]);

  // Reset filters on tab change
  function handleTabChange(tab: TabValue) {
    setActiveTab(tab);
    setSearch("");
    setChannelFilter("");
    setSectorFilter("");
  }

  // Column definitions per tab
  const columns = getColumnsForTab(activeTab);

  const tabCount = (stage: string) =>
    leads.filter((l) => l.stage === stage).length;

  return (
    <div className="mt-8">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-card-border mb-4 overflow-x-auto">
        {TABS.map((tab) => {
          const count = tabCount(tab.value);
          const isActive = activeTab === tab.value;
          const stageConfig = PIPELINE_STAGE_OPTIONS.find(
            (s) => s.value === tab.value
          );
          return (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground hover:border-gray-300"
              }`}
            >
              {tab.label}
              <span
                className={`text-xs rounded-full px-1.5 py-0.5 ${
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "bg-gray-100 text-muted"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Revenue banner for won tab */}
      {activeTab === "won" && totalRevenue > 0 && (
        <div className="flex items-center gap-2 mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <Euro className="h-4 w-4 text-green-600" />
          <span className="text-sm font-semibold text-green-800">
            Totaal revenue: €{totalRevenue.toLocaleString("nl-BE")}
          </span>
        </div>
      )}

      {/* Appointments week view */}
      {activeTab === "meeting" && meetingLeads.length > 0 && (
        <AppointmentsWeekView appointments={meetingLeads} />
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Zoek op naam of stad..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input-border bg-white pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>

        {activeTab === "contacted" && (
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="rounded-lg border border-input-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          >
            <option value="">Alle kanalen</option>
            {OUTREACH_CHANNEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        {sectors.length > 0 && (
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="rounded-lg border border-input-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          >
            <option value="">Alle sectoren</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={filteredLeads}
        emptyMessage={`Geen leads in "${TABS.find((t) => t.value === activeTab)?.label}"`}
      />
    </div>
  );
}

// ── Column definitions per tab ────────────────────────

function getColumnsForTab(tab: TabValue) {
  const baseColumns = [
    {
      key: "name",
      header: "Bedrijf",
      render: (item: PipelineLeadRow) => (
        <Link
          href={`/leads/${item.businessId}`}
          className="text-sm font-medium text-foreground hover:text-accent transition-colors"
        >
          {item.name}
        </Link>
      ),
    },
    {
      key: "city",
      header: "Stad",
      render: (item: PipelineLeadRow) => (
        <span className="text-sm text-muted">{item.city ?? "—"}</span>
      ),
    },
  ];

  switch (tab) {
    case "contacted":
      return [
        ...baseColumns,
        {
          key: "channel",
          header: "Kanaal",
          render: (item: PipelineLeadRow) => (
            <ChannelBadge channel={item.lastOutreachChannel ?? item.contactMethod} />
          ),
        },
        {
          key: "contactedAt",
          header: "Gecontacteerd op",
          render: (item: PipelineLeadRow) => (
            <span className="text-sm text-muted">
              {formatDate(item.lastOutreachAt)}
            </span>
          ),
        },
        {
          key: "sector",
          header: "Sector",
          render: (item: PipelineLeadRow) => (
            <span className="text-sm text-muted">{item.sector ?? "—"}</span>
          ),
        },
        {
          key: "priority",
          header: "Prioriteit",
          render: (item: PipelineLeadRow) => <PriorityBadge priority={item.priority} />,
        },
      ];

    case "quote_sent":
      return [
        ...baseColumns,
        {
          key: "stageChangedAt",
          header: "Offerte op",
          render: (item: PipelineLeadRow) => (
            <span className="text-sm text-muted">
              {formatDate(item.stageChangedAt)}
            </span>
          ),
        },
        {
          key: "dealValue",
          header: "Dealwaarde",
          render: (item: PipelineLeadRow) => (
            <span className="text-sm font-medium text-foreground">
              {item.dealValue ? `€${item.dealValue.toLocaleString("nl-BE")}` : "—"}
            </span>
          ),
        },
        {
          key: "followUp",
          header: "Follow-up",
          render: (item: PipelineLeadRow) => {
            if (!item.nextFollowUpAt) return <span className="text-xs text-muted">—</span>;
            const isOverdue = new Date(item.nextFollowUpAt) < new Date();
            return (
              <span className={`text-sm ${isOverdue ? "text-red-600 font-medium" : "text-muted"}`}>
                {formatDate(item.nextFollowUpAt)}
              </span>
            );
          },
        },
      ];

    case "meeting":
      return [
        ...baseColumns,
        {
          key: "meetingAt",
          header: "Afspraak",
          render: (item: PipelineLeadRow) => (
            <InlineMeetingEditor
              businessId={item.businessId}
              pipelineId={item.pipelineId}
              currentDate={item.meetingAt}
            />
          ),
        },
        {
          key: "sector",
          header: "Sector",
          render: (item: PipelineLeadRow) => (
            <span className="text-sm text-muted">{item.sector ?? "—"}</span>
          ),
        },
        {
          key: "priority",
          header: "Prioriteit",
          render: (item: PipelineLeadRow) => <PriorityBadge priority={item.priority} />,
        },
      ];

    case "won":
      return [
        ...baseColumns,
        {
          key: "wonValue",
          header: "Dealwaarde",
          render: (item: PipelineLeadRow) => {
            const val = item.wonValue ?? item.dealValue;
            return (
              <span className="text-sm font-semibold text-green-700">
                {val ? `€${val.toLocaleString("nl-BE")}` : "—"}
              </span>
            );
          },
        },
        {
          key: "closedAt",
          header: "Gesloten op",
          render: (item: PipelineLeadRow) => (
            <span className="text-sm text-muted">
              {formatDate(item.stageChangedAt)}
            </span>
          ),
        },
        {
          key: "sector",
          header: "Sector",
          render: (item: PipelineLeadRow) => (
            <span className="text-sm text-muted">{item.sector ?? "—"}</span>
          ),
        },
      ];

    case "ignored":
      return [
        ...baseColumns,
        {
          key: "reason",
          header: "Reden",
          render: (item: PipelineLeadRow) => (
            <span className="text-sm text-muted">
              {item.rejectionReason
                ? REJECTION_LABELS[item.rejectionReason] ?? item.rejectionReason
                : "—"}
            </span>
          ),
        },
        {
          key: "ignoredAt",
          header: "Datum",
          render: (item: PipelineLeadRow) => (
            <span className="text-sm text-muted">
              {formatDate(item.stageChangedAt)}
            </span>
          ),
        },
        {
          key: "reactivate",
          header: "",
          className: "w-10",
          render: (item: PipelineLeadRow) => (
            <ReactivateButton businessId={item.businessId} pipelineId={item.pipelineId} />
          ),
        },
      ];

    default:
      return baseColumns;
  }
}

// ── Sub-components ────────────────────────────────────

import { PRIORITY_OPTIONS } from "@/lib/constants";
import { Pencil, Check, Loader2 } from "lucide-react";

function InlineMeetingEditor({
  businessId,
  pipelineId,
  currentDate,
}: {
  businessId: string;
  pipelineId: string;
  currentDate: Date | string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(() => {
    if (!currentDate) return "";
    const d = new Date(currentDate);
    return d.toISOString().slice(0, 10);
  });
  const [time, setTime] = useState(() => {
    if (!currentDate) return "10:00";
    const d = new Date(currentDate);
    return d.toTimeString().slice(0, 5);
  });

  async function handleSave() {
    if (!date) return;
    setSaving(true);
    try {
      const dateTime = new Date(`${date}T${time}:00`).toISOString();
      await fetch(`/api/leads/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingAt: dateTime }),
      });
      setEditing(false);
      window.location.reload();
    } catch {
      setSaving(false);
    }
  }

  if (saving) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted" />;
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-input-border bg-white px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="rounded border border-input-border bg-white px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
        <button
          onClick={handleSave}
          className="text-green-600 hover:text-green-700"
          title="Opslaan"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-accent transition-colors group"
    >
      <Calendar className="h-3.5 w-3.5 text-indigo-500" />
      {currentDate ? formatDateTime(currentDate) : "Datum instellen"}
      <Pencil className="h-3 w-3 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const config = PRIORITY_OPTIONS.find((p) => p.value === priority);
  if (!config || priority === "medium") return null;
  return (
    <span
      className={`inline-flex items-center rounded-full text-[10px] font-medium px-1.5 py-0.5 ${config.color}`}
    >
      {config.label}
    </span>
  );
}

function ReactivateButton({
  businessId,
  pipelineId,
}: {
  businessId: string;
  pipelineId: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleReactivate() {
    setLoading(true);
    try {
      await fetch(`/api/pipeline/${pipelineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "new" }),
      });
      window.location.reload();
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleReactivate}
      disabled={loading}
      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
      title="Reactiveer lead"
    >
      <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
    </button>
  );
}
