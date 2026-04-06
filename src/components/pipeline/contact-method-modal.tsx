"use client";

import { Mail, Phone, ExternalLink, MessageCircle, Users, X } from "lucide-react";
import { useRef } from "react";

interface ContactMethodModalProps {
  open: boolean;
  leadName: string;
  onSelect: (channel: string) => void;
  onCancel: () => void;
}

const METHODS = [
  { value: "email", label: "Email", icon: Mail },
  { value: "phone", label: "Telefoon", icon: Phone },
  { value: "linkedin", label: "LinkedIn", icon: ExternalLink },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "in_person", label: "Persoonlijk", icon: Users },
] as const;

export function ContactMethodModal({
  open,
  leadName,
  onSelect,
  onCancel,
}: ContactMethodModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onCancel();
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="w-full max-w-xs bg-white rounded-xl shadow-xl border border-card-border p-5 mx-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-foreground">
            Hoe gecontacteerd?
          </h3>
          <button
            onClick={onCancel}
            className="text-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted mb-4">
          Via welk kanaal heb je{" "}
          <span className="font-medium text-foreground">{leadName}</span>{" "}
          gecontacteerd?
        </p>

        <div className="space-y-2">
          {METHODS.map((method) => {
            const Icon = method.icon;
            return (
              <button
                key={method.value}
                onClick={() => onSelect(method.value)}
                className="flex items-center gap-3 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-foreground hover:border-accent hover:bg-accent/5 transition-all"
              >
                <Icon className="h-4 w-4 text-muted" />
                {method.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
