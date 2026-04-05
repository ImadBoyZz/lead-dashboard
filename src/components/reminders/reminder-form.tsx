"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReminderFormProps {
  businessId: string;
}

const REMINDER_TYPES = [
  { value: "follow_up", label: "Follow-up" },
  { value: "call", label: "Bellen" },
  { value: "meeting_prep", label: "Meeting voorbereiden" },
  { value: "check_in", label: "Check-in" },
  { value: "custom", label: "Anders" },
];

export function ReminderForm({ businessId }: ReminderFormProps) {
  const router = useRouter();
  const [type, setType] = useState("follow_up");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !dueDate) return;
    setLoading(true);

    try {
      await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, type, title, description, dueDate }),
      });
      setTitle("");
      setDescription("");
      setDueDate("");
      router.refresh();
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border border-card-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          >
            {REMINDER_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Datum</label>
          <input
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-card-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">Titel</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Bijv. Follow-up bellen..."
          className="w-full rounded-lg border border-card-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">Beschrijving (optioneel)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Extra details..."
          rows={2}
          className="w-full rounded-lg border border-card-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-none"
        />
      </div>

      <Button variant="primary" size="sm" disabled={loading || !title || !dueDate}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {loading ? "Opslaan..." : "Reminder toevoegen"}
      </Button>
    </form>
  );
}
