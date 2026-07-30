'use client';

import type { ReactNode } from 'react';
import { SessionTimeoutDialog } from '@/components/auth/session-timeout-dialog';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui-store';
import { DesktopSidebar, MobileSidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);

  return (
    <div className="min-h-svh">
      <DesktopSidebar />
      <MobileSidebar />

      <div
        className={cn(
          'flex min-h-svh flex-col transition-[padding] duration-200',
          collapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-64',
        )}
      >
        <Topbar />
        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <SessionTimeoutDialog />
    </div>
  );
}
