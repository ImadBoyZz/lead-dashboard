import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
}

export function Card({ children, className, title, description }: CardProps) {
  return (
    <div
      className={cn(
        "bg-card rounded-xl border border-card-border shadow-sm p-6",
        className
      )}
    >
      {(title || description) && (
        <div className="mb-4">
          {title && (
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
          )}
          {description && (
            <p className="text-sm text-muted mt-0.5">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
