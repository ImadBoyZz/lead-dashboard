"use client";

import { useState } from "react";
import { Check, X, Loader2, RefreshCw } from "lucide-react";

interface Draft {
  id: string;
  businessId: string;
  channel: string;
  subject: string | null;
  body: string;
  tone: string;
  status: string;
  businessName: string | null;
  businessSector: string | null;
  businessCity: string | null;
}

interface DraftCardProps {
  draft: Draft;
  onStatusChange: (id: string, status: string) => void;
}

export function DraftCard({ draft, onStatusChange }: DraftCardProps) {
  const [body, setBody] = useState(draft.body);
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [saving, setSaving] = useState(false);

  async function updateDraft(updates: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/ai/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok && updates.status) {
        onStatusChange(draft.id, updates.status as string);
      }
    } finally {
      setSaving(false);
    }
  }

  const statusColors: Record<string, string> = {
    pending: "border-yellow-300 bg-yellow-50",
    approved: "border-green-300 bg-green-50",
    rejected: "border-red-300 bg-red-50 opacity-60",
    sent: "border-blue-300 bg-blue-50",
  };

  return (
    <div className={`rounded-xl border-2 p-4 space-y-3 ${statusColors[draft.status] ?? "border-card-border"}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-sm">{draft.businessName ?? "Onbekend"}</p>
          <div className="flex gap-2 mt-1">
            {draft.businessSector && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/80 text-muted">
                {draft.businessSector}
              </span>
            )}
            {draft.businessCity && (
              <span className="text-xs text-muted">{draft.businessCity}</span>
            )}
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          draft.status === "approved" ? "bg-green-100 text-green-700" :
          draft.status === "rejected" ? "bg-red-100 text-red-700" :
          draft.status === "sent" ? "bg-blue-100 text-blue-700" :
          "bg-yellow-100 text-yellow-700"
        }`}>
          {draft.status === "approved" ? "Goedgekeurd" :
           draft.status === "rejected" ? "Afgewezen" :
           draft.status === "sent" ? "Verstuurd" : "In afwachting"}
        </span>
      </div>

      {/* Subject */}
      {draft.channel === "email" && (
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onBlur={() => { if (subject !== (draft.subject ?? "")) updateDraft({ subject }); }}
          placeholder="Onderwerp..."
          className="w-full text-sm font-medium border-b border-card-border/50 pb-1 bg-transparent focus:outline-none focus:border-accent"
          disabled={draft.status === "rejected" || draft.status === "sent"}
        />
      )}

      {/* Body */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => { if (body !== draft.body) updateDraft({ body }); }}
        rows={14}
        className="w-full text-sm bg-transparent border rounded-lg border-card-border/50 p-3 focus:outline-none focus:border-accent"
        disabled={draft.status === "rejected" || draft.status === "sent"}
      />

      {/* Actions */}
      {draft.status === "pending" && (
        <div className="flex gap-2">
          <button
            onClick={() => updateDraft({ status: "approved" })}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Goedkeuren
          </button>
          <button
            onClick={() => updateDraft({ status: "rejected" })}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
          >
            <X className="h-3 w-3" />
            Afwijzen
          </button>
          <button
            onClick={async () => {
              setSaving(true);
              try {
                const res = await fetch("/api/ai/generate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ businessId: draft.businessId, channel: draft.channel }),
                });
                if (res.ok) {
                  const data = await res.json();
                  const v = data.variants?.[0];
                  if (v) {
                    setSubject(v.subject ?? "");
                    setBody(v.body);
                  }
                }
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50 ml-auto"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Genereer nieuw
          </button>
        </div>
      )}
    </div>
  );
}
