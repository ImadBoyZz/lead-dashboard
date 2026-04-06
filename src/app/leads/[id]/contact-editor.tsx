"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Globe,
  Mail,
  Phone,
  Link2,
  ArrowUpRight,
  Plus,
  Check,
  Loader2,
  X,
  Pencil,
} from "lucide-react";

interface ContactEditorProps {
  leadId: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  facebook: string | null;
}

interface CopyBtnProps {
  text: string;
}

function CopyBtn({ text }: CopyBtnProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      className="text-muted hover:text-foreground transition-colors text-xs"
      title="Kopieer"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

const FIELDS = [
  { key: "email", label: "Email", icon: Mail, placeholder: "email@voorbeeld.be", type: "email" },
  { key: "phone", label: "Telefoon", icon: Phone, placeholder: "+32 ...", type: "tel" },
  { key: "website", label: "Website", icon: Globe, placeholder: "https://...", type: "url" },
  { key: "facebook", label: "Facebook", icon: Link2, placeholder: "https://facebook.com/...", type: "url" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

export function ContactEditor({
  leadId,
  email,
  phone,
  website,
  facebook,
}: ContactEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState("");

  const current: Record<FieldKey, string | null> = { email, phone, website, facebook };

  function startEdit(field: FieldKey) {
    setEditing(field);
    setValue(current[field] ?? "");
  }

  function cancelEdit() {
    setEditing(null);
    setValue("");
  }

  async function handleSave() {
    if (editing === null) return;
    setSaving(true);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [editing]: value }),
      });
      setEditing(null);
      setValue("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // Fields that have a value
  const filledFields = FIELDS.filter((f) => current[f.key]);
  // Fields that are empty (can be added)
  const emptyFields = FIELDS.filter((f) => !current[f.key]);

  return (
    <div className="space-y-3">
      {/* Existing contact info */}
      {filledFields.map((field) => {
        const Icon = field.icon;
        const val = current[field.key]!;

        if (editing === field.key) {
          return (
            <div key={field.key} className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted shrink-0" />
              <input
                type={field.type}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={field.placeholder}
                autoFocus
                className="flex-1 rounded-lg border border-input-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-green-600 hover:text-green-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button onClick={cancelEdit} className="text-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        }

        const href =
          field.key === "email" ? `mailto:${val}` :
          field.key === "phone" ? `tel:${val}` :
          val.startsWith("http") ? val : `https://${val}`;

        const isLink = field.key !== "email" && field.key !== "phone";

        return (
          <div key={field.key} className="flex items-center justify-between group">
            <a
              href={href}
              target={isLink ? "_blank" : undefined}
              rel={isLink ? "noopener noreferrer" : undefined}
              className="inline-flex items-center gap-2 text-sm text-accent hover:underline min-w-0"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{val}</span>
              {isLink && <ArrowUpRight className="h-3 w-3 shrink-0" />}
            </a>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => startEdit(field.key)}
                className="opacity-0 group-hover:opacity-100 text-muted hover:text-foreground transition-all"
                title="Bewerken"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <CopyBtn text={val} />
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {filledFields.length === 0 && editing === null && (
        <p className="text-sm text-muted">Geen contactgegevens gevonden</p>
      )}

      {/* Inline edit for adding new field */}
      {editing && !filledFields.find((f) => f.key === editing) && (
        <div className="flex items-center gap-2">
          {(() => {
            const field = FIELDS.find((f) => f.key === editing)!;
            const Icon = field.icon;
            return (
              <>
                <Icon className="h-4 w-4 text-muted shrink-0" />
                <input
                  type={field.type}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={field.placeholder}
                  autoFocus
                  className="flex-1 rounded-lg border border-input-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !value}
                  className="text-green-600 hover:text-green-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </button>
                <button onClick={cancelEdit} className="text-muted hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* Add buttons for empty fields */}
      {emptyFields.length > 0 && editing === null && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-card-border">
          {emptyFields.map((field) => {
            const Icon = field.icon;
            return (
              <button
                key={field.key}
                onClick={() => startEdit(field.key)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-xs font-medium text-muted hover:border-accent hover:text-accent transition-colors"
              >
                <Plus className="h-3 w-3" />
                <Icon className="h-3 w-3" />
                {field.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
