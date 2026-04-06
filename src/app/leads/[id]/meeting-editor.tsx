"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Clock, Pencil, Check, X, Loader2, Trash2 } from "lucide-react";

interface MeetingEditorProps {
  leadId: string;
  currentMeetingAt: string | null;
}

export function MeetingEditor({ leadId, currentMeetingAt }: MeetingEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(() => {
    if (!currentMeetingAt) return "";
    return new Date(currentMeetingAt).toISOString().slice(0, 10);
  });
  const [time, setTime] = useState(() => {
    if (!currentMeetingAt) return "10:00";
    return new Date(currentMeetingAt).toTimeString().slice(0, 5);
  });

  async function handleSave() {
    if (!date) return;
    setSaving(true);
    try {
      const dateTime = new Date(`${date}T${time}:00`).toISOString();
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingAt: dateTime, status: "meeting" }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    // Reset to original values
    if (currentMeetingAt) {
      setDate(new Date(currentMeetingAt).toISOString().slice(0, 10));
      setTime(new Date(currentMeetingAt).toTimeString().slice(0, 5));
    } else {
      setDate("");
      setTime("10:00");
    }
    setEditing(false);
  }

  async function handleDelete() {
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingAt: "" }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  const formattedDate = currentMeetingAt
    ? new Date(currentMeetingAt).toLocaleDateString("nl-BE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const formattedTime = currentMeetingAt
    ? new Date(currentMeetingAt).toLocaleTimeString("nl-BE", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted mb-1">
              <Calendar className="h-3 w-3" />
              Datum
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-input-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div className="flex-1">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted mb-1">
              <Clock className="h-3 w-3" />
              Tijd
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-lg border border-input-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !date}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Opslaan
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-muted hover:bg-gray-50 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Annuleren
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-indigo-500 shrink-0" />
        {formattedDate ? (
          <div>
            <span className="text-sm font-medium text-foreground">
              {formattedDate}
            </span>
            <span className="text-sm text-muted ml-2">om {formattedTime}</span>
          </div>
        ) : (
          <span className="text-sm text-muted">Geen afspraak gepland</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {formattedDate && (
          <button
            onClick={handleDelete}
            disabled={saving}
            className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            Verwijderen
          </button>
        )}
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
        >
          <Pencil className="h-3 w-3" />
          {formattedDate ? "Wijzigen" : "Plannen"}
        </button>
      </div>
    </div>
  );
}
