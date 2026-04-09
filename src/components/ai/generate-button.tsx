"use client";

import { useState } from "react";
import { Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VariantSelector } from "./variant-selector";

interface Variant {
  subject: string | null;
  body: string;
  tone: string;
  variantIndex: number;
}

interface GenerateButtonProps {
  businessId: string;
  channel: string;
  templateId?: string;
  onSelect: (variant: Variant) => void;
}

export function GenerateButton({ businessId, channel, templateId, onSelect }: GenerateButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<Variant[] | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          channel: channel === "email" ? "email" : "phone",
          templateId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Generatie mislukt");
      }

      const data = await res.json();
      setVariants(data.variants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(variant: Variant) {
    onSelect(variant);
    setVariants(null);
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleGenerate}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wand2 className="h-4 w-4" />
        )}
        {loading ? "Genereren..." : "Genereer Concept"}
      </Button>

      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}

      {variants && (
        <VariantSelector
          variants={variants}
          onSelect={handleSelect}
          onClose={() => setVariants(null)}
        />
      )}
    </>
  );
}
