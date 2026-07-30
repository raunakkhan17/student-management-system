'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/use-auth';
import { filterNavigation, isRouteActive, NAV_SECTIONS } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import type { AppModule } from '@/types/enums';

interface SidebarNavProps {
  collapsed?: boolean;
  /** Closes the mobile sheet after a selection. */
  onNavigate?: () => void;
}

export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const { can } = useAuth();

  const sections = filterNavigation(NAV_SECTIONS, (module: AppModule) => can(module, 'VIEW'));

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-6">
      {sections.map((section, index) => (
        <div key={section.label ?? `section-${index}`} className="flex flex-col gap-1">
          {section.label && !collapsed && (
            <h2 className="text-muted-foreground px-3 pb-1 text-xs font-semibold tracking-wider uppercase">
              {section.label}
            </h2>
          )}
          {section.label && collapsed && <div className="bg-sidebar-border mx-3 h-px" role="presentation" />}

          {section.items.map((item) => {
            const active = isRouteActive(pathname, item.href);

            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  'focus-visible:ring-sidebar-ring focus-visible:ring-2 focus-visible:outline-none',
                  active
                    ? 'bg-sidebar-primary/10 text-sidebar-primary'
                    : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  collapsed && 'justify-center px-2',
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="bg-sidebar-primary absolute inset-y-1.5 left-0 w-0.5 rounded-full"
                  />
                )}
                <item.icon className="size-4.5 shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );

            // When collapsed the label is hidden, so surface it on hover/focus.
            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            );
          })}
        </div>
      ))}
    </nav>
  );
}
