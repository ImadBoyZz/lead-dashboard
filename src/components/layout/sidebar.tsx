"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, KanbanSquare, Settings, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReminderBadge } from "@/components/reminders/reminder-badge";

const navigation = [
  { name: "Leads", href: "/leads", icon: Users },
  { name: "Pipeline", href: "/pipeline", icon: KanbanSquare },
  { name: "Reminders", href: "/reminders", icon: Bell },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar text-sidebar-foreground flex flex-col z-40">
      <div className="p-6 border-b border-white/10">
        <h1 className="text-lg font-bold tracking-tight">Lead Dashboard</h1>
        <p className="text-xs text-sidebar-foreground/60 mt-0.5">Averis Solutions</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
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
              {item.name}
              {item.name === "Reminders" && <ReminderBadge />}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <p className="text-[10px] text-sidebar-foreground/40 uppercase tracking-wider">
          GDPR Compliant
        </p>
        <p className="text-[10px] text-sidebar-foreground/30 mt-0.5">v0.1.0</p>
      </div>
    </aside>
  );
}
