import { cn } from "@/lib/utils";

type StatusDotVariant = "success" | "warning" | "danger" | "idle" | "running";

interface StatusDotProps {
  variant: StatusDotVariant;
  size?: "sm" | "md";
  pulse?: boolean;
  label?: string;
  className?: string;
}

/*
 * Status glyph — geometrische shapes ipv gekleurde dots met glow.
 * Mechanischer, past bij Working Drawing karakter.
 *   ● success — gevulde cirkel
 *   ◐ warning — halfgevuld
 *   ■ danger  — gevuld vierkant (breekt ritme van cirkels → trekt oog)
 *   ○ idle    — lege cirkel
 *   ◇ running — ruit (in-beweging connotatie)
 */
const VARIANT_STYLES: Record<StatusDotVariant, { ch: string; color: string }> = {
  success: { ch: "●", color: "text-success" },
  warning: { ch: "◐", color: "text-warning" },
  danger: { ch: "■", color: "text-danger" },
  idle: { ch: "○", color: "text-ink-soft" },
  running: { ch: "◇", color: "text-accent" },
};

export function StatusDot({
  variant,
  size = "md",
  pulse = false,
  label,
  className,
}: StatusDotProps) {
  const { ch, color } = VARIANT_STYLES[variant];
  const sizeCls = size === "sm" ? "text-[10px]" : "text-[12px]";

  const glyph = (
    <span
      aria-hidden
      className={cn(
        "inline-block font-mono leading-none",
        sizeCls,
        color,
        pulse && "motion-pulse",
        className,
      )}
    >
      {ch}
    </span>
  );

  if (!label) return glyph;

  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
      {glyph}
      <span>{label}</span>
    </span>
  );
}
