import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  /** Optional module-number ("03") rendered as technical drawing label */
  module?: string;
  /** Actions rendered top-right — small buttons, links */
  actions?: React.ReactNode;
}

/**
 * Module — "Working Drawing" vervanging voor Card.
 * Geen drop-shadow. Paper-wit oppervlak op warm background, hairline border,
 * genummerde module-label waar meegegeven. Layout is functioneel, voelt als
 * een cel op technisch tekenpapier.
 */
export function Card({
  children,
  className,
  title,
  description,
  module,
  actions,
}: CardProps) {
  const hasHeader = title || description || module || actions;

  return (
    <section
      className={cn(
        "bg-surface border border-[--color-rule] rounded-[2px]",
        className,
      )}
    >
      {hasHeader && (
        <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-[--color-rule]">
          <div className="min-w-0 flex-1">
            {module && (
              <div className="module-label mb-1.5">§ {module}</div>
            )}
            {title && (
              <h2 className="text-[15px] leading-[1.3] font-medium text-ink tracking-[-0.01em]">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-[13px] text-ink-muted mt-1 leading-[1.5]">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 shrink-0 pt-1">{actions}</div>
          )}
        </header>
      )}
      <div className={cn("p-6", !hasHeader && "py-5")}>{children}</div>
    </section>
  );
}

/**
 * CardBody — use as inner container if Module already provides header/padding
 * elsewhere. Exported for migration convenience.
 */
export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-6", className)}>{children}</div>;
}
