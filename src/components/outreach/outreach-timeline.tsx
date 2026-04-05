"use client";

import { useState, useEffect } from "react";
import { Mail, Phone, ExternalLink, MessageCircle, Users, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface OutreachEntry {
  id: string;
  channel: string;
  subject: string | null;
  content: string | null;
  outcome: string | null;
  contactedAt: string;
  durationMinutes: number | null;
  nextAction: string | null;
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
