import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "w-full rounded-lg border border-input-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent",
            error && "border-danger focus:ring-danger/30 focus:border-danger",
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-danger mt-1">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
