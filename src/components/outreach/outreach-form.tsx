"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OUTREACH_CHANNEL_OPTIONS } from "@/lib/constants";
import { GenerateButton } from "@/components/ai/generate-button";

interface OutreachFormProps {
  businessId: string;
}

export function OutreachForm({ businessId }: OutreachFormProps) {
  const router = useRouter();
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [outcome, setOutcome] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await fetch(`/api/leads/${businessId}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, subject, content, outcome, aiGenerated }),
      });

      setSubject("");
      setContent("");
      setOutcome("");
      setAiGenerated(false);
      router.refresh();
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-muted mb-1">Kanaal</label>
        <div className="flex gap-2 items-end">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="flex-1 rounded-lg border border-card-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          >
            {OUTREACH_CHANNEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <GenerateButton
            businessId={businessId}
            channel={channel}
            onSelect={(variant) => {
              if (variant.subject) setSubject(variant.subject);
              setContent(variant.body);
              setAiGenerated(true);
            }}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">Onderwerp</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Onderwerp..."
          className="w-full rounded-lg border border-card-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">Bericht</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Wat heb je gecommuniceerd..."
          rows={10}
          className="w-full rounded-lg border border-card-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">Resultaat</label>
        <input
          type="text"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="Bijv. voicemail, geïnteresseerd, niet bereikbaar..."
          className="w-full rounded-lg border border-card-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
        />
      </div>

      <Button variant="primary" size="sm" disabled={loading || !channel}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {loading ? "Opslaan..." : "Log outreach"}
      </Button>
    </form>
  );
}
