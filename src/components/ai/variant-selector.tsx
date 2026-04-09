"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";

interface Variant {
  subject: string | null;
  body: string;
  tone: string;
  variantIndex: number;
}

interface VariantSelectorProps {
  variants: Variant[];
  onSelect: (variant: Variant) => void;
  onClose: () => void;
}

export function VariantSelector({ variants, onSelect, onClose }: VariantSelectorProps) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-card-border">
          <h3 className="text-lg font-semibold">Kies een variant</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Variants grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
          {variants.map((variant) => (
            <button
              key={variant.variantIndex}
              type="button"
              onClick={() => setSelected(variant.variantIndex)}
              className={`text-left rounded-xl border-2 p-4 transition-all hover:shadow-md ${
                selected === variant.variantIndex
                  ? "border-accent bg-accent/5 shadow-md"
                  : "border-card-border hover:border-accent/40"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted">
                  Variant {variant.variantIndex + 1}
                </span>
                {selected === variant.variantIndex && (
                  <Check className="h-4 w-4 text-accent" />
                )}
              </div>

              {variant.subject && (
                <p className="font-medium text-sm mb-2">
                  {variant.subject}
                </p>
              )}

              <p className="text-sm text-muted whitespace-pre-wrap">
                {variant.body}
              </p>

              <span className="inline-block mt-3 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-muted">
                {variant.tone === "formal" ? "Formeel" : "Semi-formeel"}
              </span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-card-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 transition-colors"
          >
            Annuleren
          </button>
          <button
            onClick={() => {
              const v = variants.find((v) => v.variantIndex === selected);
              if (v) onSelect(v);
            }}
            disabled={selected === null}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Selecteer variant
          </button>
        </div>
      </div>
    </div>
  );
}
