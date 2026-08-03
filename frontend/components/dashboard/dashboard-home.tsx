'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { AdminDashboard, AdminDashboardSkeleton } from '@/components/dashboard/admin-dashboard';
import {
  ParentDashboard,
  StudentDashboard,
  TeacherDashboard,
} from '@/components/dashboard/role-dashboards';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useNow } from '@/hooks/use-now';
import { filterNavigation, NAV_SECTIONS } from '@/lib/navigation';
import { dashboardService } from '@/services/dashboard.service';
import { ROLE_LABELS, type AppModule } from '@/types/enums';

function greeting(now: number): string {
  // `useNow` reports 0 until hydration. The server cannot know the reader's
  // timezone, so stay neutral rather than guess a time of day.
  if (now === 0) return 'Welcome';

  const hour = new Date(now).getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Role-aware landing page — PRD Module 2. */
export function DashboardHome() {
  const { user, can } = useAuth();
  const now = useNow();

  const query = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => dashboardService.getSummary(),
  });

  return (
    <div>
      <PageHeader
        title={`${greeting(now)}, ${user?.firstName ?? ''}`}
        description={user ? `You are signed in as ${ROLE_LABELS[user.role]}.` : undefined}
      />

      <div className="space-y-10">
        {query.isPending ? (
          <AdminDashboardSkeleton />
        ) : query.isError ? (
          <p className="text-muted-foreground text-sm">
            Your dashboard could not be loaded. Please refresh the page.
          </p>
        ) : query.data.role === 'TEACHER' ? (
          <TeacherDashboard summary={query.data} />
        ) : query.data.role === 'STUDENT' ? (
          <StudentDashboard summary={query.data} />
        ) : query.data.role === 'PARENT' ? (
          <ParentDashboard summary={query.data} />
        ) : (
          <AdminDashboard summary={query.data} />
        )}

        <QuickAccess canView={can} />
      </div>
    </div>
  );
}

/** Every module this role may open, grouped the way the sidebar groups them. */
function QuickAccess({
  canView,
}: {
  canView: (module: AppModule, action: 'VIEW') => boolean;
}) {
  // Skip the "Dashboard" entry itself when listing where the user can go.
  const sections = filterNavigation(NAV_SECTIONS, (module: AppModule) =>
    canView(module, 'VIEW'),
  ).filter((section) => section.label !== undefined);

  return (
    <div className="space-y-6">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        Quick access
      </h2>

      {sections.map((section) => (
        <section key={section.label} aria-labelledby={`section-${section.label}`}>
          <h3
            id={`section-${section.label}`}
            className="text-muted-foreground mb-3 text-xs font-medium"
          >
            {section.label}
          </h3>
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
  );
}
