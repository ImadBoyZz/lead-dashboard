"use client";

import { useState, useEffect } from "react";
import { Mail, Phone, ExternalLink, MessageCircle, Users, Clock, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { FollowUpCard } from "@/components/ai/follow-up-card";

interface OutreachEntry {
  id: string;
  channel: string;
  subject: string | null;
  content: string | null;
  outcome: string | null;
  contactedAt: string;
  structuredOutcome: string | null;
  durationMinutes: number | null;
  nextAction: string | null;
  gmailThreadId: string | null;
}

interface ThreadMessage {
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  isReply: boolean;
}

function ThreadView({ threadId }: { threadId: string }) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadThread() {
    if (messages.length > 0) {
      setOpen(!open);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gmail/thread/${threadId}`);
      if (!res.ok) throw new Error("Thread ophalen mislukt");
      const data = await res.json();
      setMessages(data.messages);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={loadThread}
        className="flex items-center gap-1.5 text-xs text-accent hover:underline"
      >
        {loading ? (
          <Clock className="h-3 w-3 animate-spin" />
        ) : open ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <MessageSquare className="h-3 w-3" />
        )}
        {loading ? "Laden..." : open ? "Verberg reactie" : "Bekijk reactie"}
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {open && messages.length > 0 && (
        <div className="mt-2 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-lg p-3 text-sm ${
                msg.isReply
                  ? "bg-blue-50 border border-blue-200"
                  : "bg-gray-50 border border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${msg.isReply ? "text-blue-700" : "text-gray-600"}`}>
                  {msg.isReply ? "Reactie" : "Verzonden"}
                </span>
                <span className="text-xs text-muted">{msg.date}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{msg.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  email: Mail,
  phone: Phone,
  linkedin: ExternalLink,
  whatsapp: MessageCircle,
  in_person: Users,
};

interface OutreachTimelineProps {
  businessId: string;
}

export function OutreachTimeline({ businessId }: OutreachTimelineProps) {
  const [entries, setEntries] = useState<OutreachEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/leads/${businessId}/outreach`)
      .then((res) => res.json())
      .then((data) => setEntries(data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [businessId]);

  if (loading) {
    return <p className="text-sm text-muted">Laden...</p>;
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted">Nog geen outreach gelogd</p>;
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => {
        const Icon = CHANNEL_ICONS[entry.channel] ?? Mail;
        return (
          <div key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 w-px bg-card-border mt-1" />
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium capitalize">{entry.channel.replace("_", " ")}</span>
                <span className="text-muted flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(entry.contactedAt)}
                </span>
                {entry.durationMinutes && (
                  <span className="text-xs text-muted">({entry.durationMinutes} min)</span>
                )}
              </div>
              {entry.subject && (
                <p className="text-sm font-medium mt-1">{entry.subject}</p>
              )}
              {entry.content && (
                <p className="text-sm text-muted mt-1 whitespace-pre-wrap">{entry.content}</p>
              )}
              {entry.outcome && (
                <p className="text-xs mt-1">
                  <span className="text-muted">Resultaat:</span> {entry.outcome}
                </p>
              )}
              {entry.nextAction && (
                <p className="text-xs mt-0.5">
                  <span className="text-muted">Volgende stap:</span> {entry.nextAction}
                </p>
              )}
              {entry.gmailThreadId && (
                <ThreadView threadId={entry.gmailThreadId} />
              )}
              {(entry.outcome || entry.structuredOutcome) && (
                <FollowUpCard outreachLogId={entry.id} businessId={businessId} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
