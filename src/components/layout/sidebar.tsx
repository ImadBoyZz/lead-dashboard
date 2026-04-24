"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SidebarHealthDot } from "@/components/layout/sidebar-health-dot";

/*
 * Sidebar — "Working Drawing" reinterpretatie.
 * Geen iconen meer: elke rij krijgt een monospace modulenummer (00, 01, 02...)
 * + naam. Voelt als register op een technische tekening. Active state = ink-dot
 * + ink-tekst; inactive = muted. Geen filled-background-blocks.
 */

const navigation = [
  { module: "00", name: "Cold leads", href: "/leads" },
  { module: "01", name: "Warm leads", href: "/warm" },
  { module: "02", name: "Autonomy", href: "/autonomy" },
  { module: "03", name: "Review", href: "/review", badge: "pending" as const },
  { module: "04", name: "Pipeline", href: "/pipeline" },
  { module: "05", name: "Logs", href: "/logs" },
  { module: "06", name: "Settings", href: "/settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch("/api/ai/drafts/pending-count");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setPendingCount(data.pending ?? 0);
      } catch {
        // keep silent
      }
    }

    fetchCount();
    const id = setInterval(fetchCount, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-60 bg-sidebar text-sidebar-foreground flex flex-col z-40 border-r border-[--color-rule]"
    >
      <div className="px-6 pt-7 pb-6 border-b border-[--color-rule]">
        <div className="module-label mb-1.5">§ averis / lead dashboard</div>
        <h1 className="text-[17px] leading-[1.2] tracking-[-0.01em] font-medium">
          Control panel
        </h1>
        <p className="text-[11px] text-ink-soft mt-0.5 font-mono tabular">
          v1.0 · {new Date().toLocaleDateString("nl-BE", { day: "2-digit", month: "short", year: "numeric" })}
        </p>
      </div>

      <nav className="flex-1 px-2.5 py-4 flex flex-col gap-0.5">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const showBadge =
            item.badge === "pending" && pendingCount !== null && pendingCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 rounded-sm",
                "text-[13.5px] leading-[1.1] transition-colors",
                isActive
                  ? "text-ink bg-[--color-surface-hover]"
                  : "text-ink-muted hover:text-ink hover:bg-[--color-surface-hover]/60",
              )}
            >
              <span
                className={cn(
                  "font-mono tabular text-[10.5px] tracking-[0.08em] w-6",
                  isActive ? "text-accent" : "text-ink-soft",
                )}
              >
                {item.module}
              </span>
              <span className={cn("truncate", isActive && "font-medium")}>
                {item.name}
              </span>
              {showBadge && (
                <span className="font-mono tabular text-[10.5px] text-accent bg-[--color-accent-weak] px-1.5 py-0.5 rounded-sm min-w-[22px] text-center">
                  {pendingCount}
                </span>
              )}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-ink"
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[--color-rule]">
        <div className="px-3 py-3">
          <SidebarHealthDot />
        </div>
        <div className="px-6 py-3 border-t border-[--color-rule-soft]">
          <div className="module-label">§ compliance</div>
          <p className="text-[11px] text-ink-soft mt-1 leading-[1.4]">
            GDPR · opt-in per lead · audit-trail 7 jaar
          </p>
        </div>
      </div>
    </aside>
  );
}
