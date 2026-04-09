"use client";

import { useState, useEffect } from "react";
import { Loader2, Send, CheckCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DraftCard } from "./draft-card";

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

interface DraftApprovalBoardProps {
  campaignId: string;
}

export function DraftApprovalBoard({ campaignId }: DraftApprovalBoardProps) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/ai/drafts?campaignId=${campaignId}`)
      .then((res) => res.json())
      .then((data) => setDrafts(data))
      .catch(() => setDrafts([]))
      .finally(() => setLoading(false));
  }, [campaignId]);

  function handleStatusChange(id: string, status: string) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
  }

  async function approveAll() {
    const pendingIds = drafts.filter((d) => d.status === "pending").map((d) => d.id);
    for (const id of pendingIds) {
      await fetch(`/api/ai/drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
    }
    setDrafts((prev) => prev.map((d) => d.status === "pending" ? { ...d, status: "approved" } : d));
  }

  async function rejectAll() {
    const pendingIds = drafts.filter((d) => d.status === "pending").map((d) => d.id);
    for (const id of pendingIds) {
      await fetch(`/api/ai/drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
    }
    setDrafts((prev) => prev.map((d) => d.status === "pending" ? { ...d, status: "rejected" } : d));
  }

  async function sendApproved() {
    const approvedIds = drafts.filter((d) => d.status === "approved").map((d) => d.id);
    if (approvedIds.length === 0) return;

    setSending(true);
    try {
      const res = await fetch("/api/ai/drafts/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftIds: approvedIds }),
      });

      if (res.ok) {
        const data = await res.json();
        setDrafts((prev) => prev.map((d) =>
          approvedIds.includes(d.id) ? { ...d, status: "sent" } : d
        ));
        alert(`${data.count} outreach berichten verstuurd!`);
        router.refresh();
      }
    } finally {
      setSending(false);
    }
  }

  const approvedCount = drafts.filter((d) => d.status === "approved").length;
  const pendingCount = drafts.filter((d) => d.status === "pending").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  if (drafts.length === 0) {
    return <p className="text-sm text-muted py-8 text-center">Geen drafts gevonden voor deze campagne.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        {pendingCount > 0 && (
          <>
            <Button variant="secondary" size="sm" onClick={approveAll}>
              <CheckCheck className="h-4 w-4" />
              Alles goedkeuren ({pendingCount})
            </Button>
            <Button variant="secondary" size="sm" onClick={rejectAll}>
              <XCircle className="h-4 w-4" />
              Alles afwijzen
            </Button>
          </>
        )}
        {approvedCount > 0 && (
          <Button variant="primary" size="sm" onClick={sendApproved} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Versturen..." : `Verstuur goedgekeurd (${approvedCount})`}
          </Button>
        )}
      </div>

      {/* Draft grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {drafts.map((draft) => (
          <DraftCard
            key={draft.id}
            draft={draft}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>
    </div>
  );
}
