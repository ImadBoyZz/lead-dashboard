"use client";

import { useEffect, useState } from "react";
import { Undo2, X } from "lucide-react";

interface UndoToastProps {
  action: "promote" | "blacklist" | "skip";
  leadName: string;
  onUndo: () => void;
  onDismiss: () => void;
}

const ACTION_LABEL: Record<UndoToastProps["action"], string> = {
  promote: "Promoted",
  blacklist: "Blacklisted",
  skip: "Skipped",
};

const DURATION_MS = 5000;

export function UndoToast({ action, leadName, onUndo, onDismiss }: UndoToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setVisible(false);
      // Kleine delay zodat de fade-out animatie kan spelen
      setTimeout(onDismiss, 200);
    }, DURATION_MS);
    return () => clearTimeout(timeout);
  }, [onDismiss]);

  return (
    <div
      className={
        "fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full bg-foreground px-5 py-3 shadow-lg transition-all duration-200 " +
        (visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")
      }
    >
      <div className="text-sm text-white">
        <span className="font-semibold">{ACTION_LABEL[action]}</span>
        <span className="opacity-70 ml-1.5">· {leadName}</span>
      </div>
      <button
        onClick={onUndo}
        className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-xs font-medium text-white transition-colors"
        title="Undo (u)"
      >
        <Undo2 className="h-3 w-3" />
        Undo
      </button>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(onDismiss, 200);
        }}
        className="text-white/60 hover:text-white transition-colors"
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
