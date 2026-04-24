import { cn } from "@/lib/utils";

type StatusDotVariant = "success" | "warning" | "danger" | "idle" | "running";

interface StatusDotProps {
  variant: StatusDotVariant;
  size?: "sm" | "md";
  pulse?: boolean;
  label?: string;
  className?: string;
}

const VARIANT_STYLES: Record<StatusDotVariant, { bg: string; glow: string }> = {
  success: {
    bg: "bg-success",
    glow: "shadow-[0_0_0_3px_var(--color-dot-glow-success)]",
  },
  warning: {
    bg: "bg-warning",
    glow: "shadow-[0_0_0_3px_var(--color-dot-glow-warning)]",
  },
  danger: {
    bg: "bg-danger",
    glow: "shadow-[0_0_0_3px_var(--color-dot-glow-danger)]",
  },
  idle: {
    bg: "bg-slate-400",
    glow: "shadow-[0_0_0_3px_var(--color-dot-glow-idle)]",
  },
  running: {
    bg: "bg-accent",
    glow: "shadow-[0_0_0_3px_rgba(37,99,235,0.22)]",
  },
};

export function StatusDot({
  variant,
  size = "md",
  pulse = false,
  label,
  className,
}: StatusDotProps) {
  const { bg, glow } = VARIANT_STYLES[variant];
  const sizeCls = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";

  const dot = (
    <span
      aria-hidden
      className={cn(
        "inline-block rounded-full shrink-0",
        sizeCls,
        bg,
        glow,
        pulse && "motion-pulse",
        className,
      )}
    />
  );

  if (!label) return dot;

  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      {dot}
      <span>{label}</span>
    </span>
  );
}
