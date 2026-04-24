import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

/*
 * Button — Working Drawing stijl.
 * Sharp corners (2px radius), flat surfaces, functional. Primary = ink, niet
 * accent — accent blijft gereserveerd voor semantische hoogtepunten en
 * status-glyphs. Subtile borders, geen shadows.
 */
const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-ink text-surface hover:bg-ink-muted",
  secondary:
    "bg-surface border border-[--color-rule-strong] text-ink hover:bg-[--color-surface-hover]",
  ghost:
    "text-ink-muted hover:text-ink hover:bg-[--color-surface-hover]",
  danger:
    "bg-danger text-white hover:bg-danger/90",
};

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "text-[12px] leading-none px-2.5 h-7",
  md: "text-[13px] leading-none px-3.5 h-9",
  lg: "text-[14px] leading-none px-5 h-11",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-[2px] font-medium",
          "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
          variantStyles[variant],
          sizeStyles[size],
          disabled && "opacity-50 cursor-not-allowed pointer-events-none",
          className,
        )}
        disabled={disabled}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
