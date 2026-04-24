import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "success" | "warning" | "danger" | "info";
}

/*
 * Badge — "Working Drawing" stijl.
 * Geen pill met gekleurde achtergrond meer; tight mono-label met dunne border
 * of subtiele tint. Voelt als een technisch label, niet als een status-pil.
 */
const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "border-[--color-rule-strong] text-ink-muted",
  success: "border-[color:var(--color-success)]/40 text-[color:var(--color-success)] bg-[--color-success-weak]/60",
  warning: "border-[color:var(--color-warning)]/40 text-[color:var(--color-warning)] bg-[--color-warning-weak]/60",
  danger: "border-[color:var(--color-danger)]/40 text-[color:var(--color-danger)] bg-[--color-danger-weak]/60",
  info: "border-[color:var(--color-accent)]/40 text-accent bg-[--color-accent-weak]/60",
};

export function Badge({ children, className, variant = "default" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-[20px] rounded-[2px] px-1.5 border",
        "font-mono tabular text-[10.5px] tracking-[0.06em] uppercase whitespace-nowrap",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
