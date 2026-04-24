import { cn } from "@/lib/utils";

interface MetricTileProps {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  accent?: "default" | "success" | "warning" | "danger";
  className?: string;
}

const ACCENT_STYLES: Record<NonNullable<MetricTileProps["accent"]>, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export function MetricTile({
  label,
  value,
  unit,
  hint,
  accent = "default",
  className,
}: MetricTileProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-2xl leading-none font-mono tabular font-medium",
            ACCENT_STYLES[accent],
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="text-sm text-muted font-mono tabular">{unit}</span>
        )}
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
