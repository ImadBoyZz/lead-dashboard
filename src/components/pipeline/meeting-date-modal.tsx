"use client";

import { useState, useRef, useEffect } from "react";
import { X, Calendar, Clock } from "lucide-react";

interface MeetingDateModalProps {
  open: boolean;
  leadName: string;
  onConfirm: (dateTime: string) => void;
  onCancel: () => void;
  initialDate?: string;
}

function getDefaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getDefaultTime(): string {
  return "10:00";
}

export function MeetingDateModal({
  open,
  leadName,
  onConfirm,
  onCancel,
  initialDate,
}: MeetingDateModalProps) {
  const [date, setDate] = useState(() => {
    if (initialDate) {
      const d = new Date(initialDate);
      return d.toISOString().slice(0, 10);
    }
    return getDefaultDate();
  });
  const [time, setTime] = useState(() => {
    if (initialDate) {
      const d = new Date(initialDate);
      return d.toTimeString().slice(0, 5);
    }
    return getDefaultTime();
  });

  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset when modal opens with new data
  useEffect(() => {
    if (open) {
      if (initialDate) {
        const d = new Date(initialDate);
        setDate(d.toISOString().slice(0, 10));
        setTime(d.toTimeString().slice(0, 5));
      } else {
        setDate(getDefaultDate());
        setTime(getDefaultTime());
      }
    }
  }, [open, initialDate]);

  if (!open) return null;

  function handleConfirm() {
    const dateTime = new Date(`${date}T${time}:00`).toISOString();
    onConfirm(dateTime);
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) {
      onCancel();
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-card-border p-6 mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">
            Afspraak plannen
          </h3>
          <button
            onClick={onCancel}
            className="text-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Lead name */}
        <p className="text-sm text-muted mb-4">
          Wanneer is de afspraak met{" "}
          <span className="font-medium text-foreground">{leadName}</span>?
        </p>

        {/* Date & Time inputs */}
        <div className="space-y-3">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted mb-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Datum
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-input-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted mb-1.5">
              <Clock className="h-3.5 w-3.5" />
              Tijd
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-lg border border-input-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-muted hover:bg-gray-50 transition-colors"
          >
            Annuleren
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
          >
            Bevestigen
          </button>
        </div>
      </div>
    </div>
  );
}
