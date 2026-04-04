"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AddNoteProps {
  leadId: string;
}

export function AddNote({ leadId }: AddNoteProps) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || isLoading) return;

    setIsLoading(true);

    try {
      const res = await fetch("/api/leads/" + leadId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: content.trim() }),
      });

      if (res.ok) {
        setContent("");
        router.refresh();
      }
    } catch {
      // Silent fail
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Schrijf een notitie..."
        rows={3}
        className="w-full rounded-lg border border-input-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"
      />
      <Button
        type="submit"
        size="sm"
        disabled={!content.trim() || isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        Notitie toevoegen
      </Button>
    </form>
  );
}
