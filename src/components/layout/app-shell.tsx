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
      <main className="flex-1 ml-64 p-6">{children}</main>
    </div>
  );
}
