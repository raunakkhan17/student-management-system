'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui-store';
import { SidebarNav } from './sidebar-nav';

/** Fixed sidebar for tablet and desktop (≥ lg). */
export function DesktopSidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggle = useUiStore((state) => state.toggleSidebar);

  return (
    <aside
      className={cn(
        'bg-sidebar text-sidebar-foreground border-sidebar-border fixed inset-y-0 left-0 z-30 hidden border-r transition-[width] duration-200 lg:flex lg:flex-col',
        collapsed ? 'w-[4.5rem]' : 'w-64',
      )}
    >
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b px-4',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        <Link href="/dashboard" className="rounded-md focus-visible:ring-2 focus-visible:outline-none">
          <Logo iconOnly={collapsed} />
          <span className="sr-only">EduCore home</span>
        </Link>
      </div>

      <ScrollArea className="flex-1">
        <div className={cn('py-4', collapsed ? 'px-2' : 'px-3')}>
          <SidebarNav collapsed={collapsed} />
        </div>
      </ScrollArea>

      <div className={cn('border-sidebar-border border-t p-2', collapsed && 'flex justify-center')}>
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          onClick={toggle}
          className={cn(!collapsed && 'w-full justify-start')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden />
          ) : (
            <>
              <PanelLeftClose className="size-4" aria-hidden />
              Collapse
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}

/** Slide-over navigation for phones and small tablets. */
export function MobileSidebar() {
  const open = useUiStore((state) => state.mobileNavOpen);
  const setOpen = useUiStore((state) => state.setMobileNavOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="bg-sidebar w-72 p-0">
        <SheetHeader className="h-16 justify-center border-b px-4">
          <SheetTitle className="text-left">
            <Logo />
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100svh-4rem)]">
          <div className="px-3 py-4">
            <SidebarNav onNavigate={() => setOpen(false)} />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
