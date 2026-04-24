'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isBareLayoutPage =
    pathname === '/login' || pathname.startsWith('/unsubscribe');

  if (isBareLayoutPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60">
        <div className="max-w-[1400px] mx-auto px-10 pt-10 pb-16">
          {children}
        </div>
      </main>
    </div>
  );
}
