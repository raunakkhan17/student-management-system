'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { filterNavigation, NAV_SECTIONS } from '@/lib/navigation';
import { ROLE_LABELS, type AppModule } from '@/types/enums';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Role-aware landing page. Widgets and charts described in PRD Module 2 are
 * added once the modules that produce their data exist.
 */
export function DashboardHome() {
  const { user, can } = useAuth();

  // Skip the "Dashboard" entry itself when listing where the user can go.
  const sections = filterNavigation(NAV_SECTIONS, (module: AppModule) => can(module, 'VIEW')).filter(
    (section) => section.label !== undefined,
  );

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${user?.firstName ?? ''}`}
        description={
          user
            ? `You are signed in as ${ROLE_LABELS[user.role]}. Here is everything available to you.`
            : undefined
        }
      />

      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.label} aria-labelledby={`section-${section.label}`}>
            <h2
              id={`section-${section.label}`}
              className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase"
            >
              {section.label}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {section.items.map((item) => (
                <Card
                  key={item.href}
                  className="hover:border-primary/40 focus-within:ring-ring group relative transition-colors focus-within:ring-2"
                >
                  <CardContent className="flex items-start gap-3 pt-6">
                    <span className="bg-primary-muted text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                      <item.icon className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={item.href}
                        className="text-sm font-medium after:absolute after:inset-0 focus:outline-none"
                      >
                        {item.label}
                      </Link>
                    </div>
                    <ArrowRight
                      className="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-colors"
                      aria-hidden
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
