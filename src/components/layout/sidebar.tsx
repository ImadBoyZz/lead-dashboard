"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Snowflake, Flame, KanbanSquare, Settings, FileText, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Cold Leads", href: "/leads", icon: Snowflake },
  { name: "Warm Leads", href: "/warm", icon: Flame },
  { name: "Review", href: "/review", icon: Inbox, badge: "pending" as const },
  { name: "Pipeline", href: "/pipeline", icon: KanbanSquare },
  { name: "Logs", href: "/logs", icon: FileText },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      try {
        const res = await fetch('/api/ai/drafts/pending-count');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPendingCount(data.pending ?? 0);
      } catch {
        // ignore — badge blijft dan leeg
      }
    }
    fetchCount();
    const id = setInterval(fetchCount, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [pathname]);

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar text-sidebar-foreground flex flex-col z-40">
      <div className="p-6 border-b border-white/10">
        <h1 className="text-lg font-bold tracking-tight">Lead Dashboard</h1>
        <p className="text-xs text-sidebar-foreground/60 mt-0.5">Averis Solutions</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const showBadge = item.badge === 'pending' && pendingCount !== null && pendingCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-active text-white"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-hover hover:text-white"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.name}</span>
              {showBadge && (
                <span className="inline-flex min-w-[1.5rem] h-5 items-center justify-center rounded-full bg-accent text-white text-xs font-semibold px-1.5">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <p className="text-[10px] text-sidebar-foreground/40 uppercase tracking-wider">
          GDPR Compliant
        </p>
        <p className="text-[10px] text-sidebar-foreground/30 mt-0.5">v1.0</p>
      </div>
    </aside>
  );
}
