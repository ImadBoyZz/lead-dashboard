import { cn } from "@/lib/utils";

interface MetricTileProps {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  accent?: "default" | "success" | "warning" | "danger" | "accent";
  className?: string;
}

const ACCENT_STYLES: Record<NonNullable<MetricTileProps["accent"]>, string> = {
  default: "text-ink",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  accent: "text-accent",
};

/**
 * MetricTile — module-label boven, grote mono-tabular waarde, klein hint.
 * Nieuwe stijl: display font groter, lichter gewicht, iets meer vertical rhythm.
 * Bedoeld om grote getallen dominant te maken zonder decoratie.
 */
export function MetricTile({
  label,
  value,
  unit,
  hint,
  accent = "default",
  className,
}: MetricTileProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      <span className="module-label">{label}</span>
      <div className="flex items-baseline gap-1.5 mt-2">
        <span
          className={cn(
            "font-mono tabular text-[28px] leading-none tracking-[-0.02em] font-normal",
            ACCENT_STYLES[accent],
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[13px] text-ink-muted font-mono tabular">{unit}</span>
        )}
      </div>
      {hint && (
        <span className="text-[12px] text-ink-muted mt-1.5 leading-[1.4]">
          {hint}
        </span>
      )}
    </div>
  );
}
