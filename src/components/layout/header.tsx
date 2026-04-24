interface HeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Optionele module-nummer zoals in technische tekeningen: "§ 00" */
  module?: string;
}

export function Header({ title, description, actions, module }: HeaderProps) {
  return (
    <header className="mb-8 border-b border-[--color-rule] pb-6">
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0 flex-1">
          {module && (
            <div className="module-label mb-2">§ {module}</div>
          )}
          <h1 className="text-[32px] leading-[1.05] tracking-[-0.02em] text-ink font-medium">
            {title}
          </h1>
          {description && (
            <p className="text-[13px] text-ink-muted mt-2 max-w-[68ch] leading-[1.55]">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
