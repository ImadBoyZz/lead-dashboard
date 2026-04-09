"use client";

import { useState } from "react";
import { Mail, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GmailSendButtonProps {
  businessId: string;
  to: string;
  subject: string;
  body: string;
  draftId?: string;
  onSent?: () => void;
  disabled?: boolean;
}

export function GmailSendButton({
  businessId,
  to,
  subject,
  body,
  draftId,
  onSent,
  disabled,
}: GmailSendButtonProps) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!to || !subject || !body) {
      setError("Vul email, onderwerp en bericht in");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, to, subject, body, draftId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Versturen mislukt");
      }

      setSent(true);
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
        <Check className="h-4 w-4" />
        Verstuurd via Gmail
      </div>
    );
  }

  return (
    <div>
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={handleSend}
        disabled={loading || disabled || !to}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Mail className="h-4 w-4" />
        )}
        {loading ? "Versturen..." : "Verstuur via Gmail"}
      </Button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
