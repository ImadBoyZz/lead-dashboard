"use client";

import { useState } from "react";
import { Mail, Phone, ExternalLink, Loader2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Suggestion {
  suggestedAction: string;
  suggestedChannel: string;
  suggestedDays: number;
  draftMessage: string;
  reasoning: string;
}

interface FollowUpCardProps {
  outreachLogId: string;
  businessId: string;
}

const channelIcons: Record<string, typeof Mail> = {
  email: Mail,
  phone: Phone,
  linkedin: ExternalLink,
};

export function FollowUpCard({ outreachLogId, businessId }: FollowUpCardProps) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function fetchSuggestion() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/ai/follow-up/${outreachLogId}`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Suggestie ophalen mislukt");
      }

      const data = await res.json();
      setSuggestion(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    if (!suggestion) return;
    setAccepting(true);

    try {
      const res = await fetch(`/api/ai/follow-up/${outreachLogId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestedChannel: suggestion.suggestedChannel,
          suggestedDays: suggestion.suggestedDays,
          draftMessage: suggestion.draftMessage,
          suggestedAction: suggestion.suggestedAction,
          businessId,
        }),
      });

      if (!res.ok) throw new Error("Accepteren mislukt");
      setAccepted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setAccepting(false);
    }
  }

  if (accepted) {
    return (
      <div className="rounded-lg border-2 border-green-300 bg-green-50 p-4">
        <div className="flex items-center gap-2 text-green-700">
          <Check className="h-4 w-4" />
          <span className="text-sm font-medium">Reminder aangemaakt</span>
        </div>
      </div>
    );
  }

  if (!suggestion) {
    return (
      <div className="mt-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={fetchSuggestion}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mail className="h-4 w-4" />
          )}
          {loading ? "Ophalen..." : "AI suggestie ophalen"}
        </Button>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }

  const ChannelIcon = channelIcons[suggestion.suggestedChannel] ?? Mail;

  return (
    <div className="mt-3 rounded-lg border border-card-border bg-white p-4 space-y-3">
      {/* Actie + timing */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent/10">
          <ChannelIcon className="h-4 w-4 text-accent" />
        </div>
        <div>
          <p className="text-sm font-medium">{suggestion.suggestedAction}</p>
          <p className="text-xs text-muted">
            Over {suggestion.suggestedDays} dag{suggestion.suggestedDays !== 1 ? "en" : ""} via {suggestion.suggestedChannel}
          </p>
        </div>
      </div>

      {/* Concept bericht (collapsible) */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Concept bericht
      </button>
      {expanded && (
        <div className="text-sm text-muted bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">
          {suggestion.draftMessage}
        </div>
      )}

      {/* Redenering */}
      <p className="text-xs text-muted/70">{suggestion.reasoning}</p>

      {/* Accepteer knop */}
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={handleAccept}
        disabled={accepting}
      >
        {accepting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        {accepting ? "Verwerken..." : "Accepteer"}
      </Button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
