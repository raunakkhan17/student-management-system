'use client';

import {
  BadgeIndianRupee,
  CalendarClock,
  ClipboardCheck,
  GraduationCap,
  Megaphone,
  ScrollText,
  UserPlus,
  UsersRound,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AttendanceTrendChart,
  DepartmentStatisticsChart,
  FeeCollectionChart,
  GenderDistributionChart,
  StudentGrowthChart,
} from '@/components/dashboard/dashboard-charts';
import { StatTile, StatTileSkeleton } from '@/components/dashboard/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency, formatDate, formatRelative } from '@/lib/format';
import { dashboardService } from '@/services/dashboard.service';
import type { AdminSummary } from '@/types/dashboard';
import { AUDIT_ACTION_LABELS } from '@/types/enums';

const QUICK_ACTIONS = [
  { label: 'Add student', href: '/students/new', icon: UserPlus, module: 'STUDENTS' },
  { label: 'Add teacher', href: '/teachers/new', icon: UsersRound, module: 'TEACHERS' },
  { label: 'Create notice', href: '/notices', icon: Megaphone, module: 'NOTICES' },
  { label: 'Generate report', href: '/reports', icon: ScrollText, module: 'REPORTS' },
] as const;

export function AdminDashboard({ summary }: { summary: AdminSummary }) {
  const { can } = useAuth();

  // Charts are a second request so the tiles above are not held back by the
  // slower range queries.
  const charts = useQuery({
    queryKey: ['dashboard', 'charts', 30],
    queryFn: () => dashboardService.getCharts(30),
  });

  const { totals, attendanceToday, fees } = summary;

  return (
    <div className="space-y-8">
      <section aria-label="Key figures">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Total students"
            value={totals.students}
            icon={GraduationCap}
            hint="Active enrolments"
            href="/students"
          />
          <StatTile
            label="Total teachers"
            value={totals.teachers}
            icon={UsersRound}
            hint="Active staff"
            href="/teachers"
          />
          <StatTile
            label="New admissions"
            value={totals.newAdmissions}
            icon={UserPlus}
            hint="Last 30 days"
            href="/students"
          />
          <StatTile
            label="Today's attendance"
            value={attendanceToday.percentage === null ? '—' : `${attendanceToday.percentage}%`}
            icon={ClipboardCheck}
            tone={
              attendanceToday.percentage !== null && attendanceToday.percentage < 75
                ? 'warning'
                : 'default'
            }
            hint={
              attendanceToday.total === 0
                ? 'No register marked yet'
                : `${attendanceToday.present} present · ${attendanceToday.absent} absent`
            }
            href="/attendance"
          />
          <StatTile
            label="Fees collected"
            value={formatCurrency(fees.collected)}
            icon={Wallet}
            hint={
              fees.collectionRate === null
                ? 'Nothing billed yet'
                : `${fees.collectionRate}% of billed`
            }
            href="/fees"
          />
          <StatTile
            label="Pending fees"
            value={formatCurrency(fees.pending)}
            icon={BadgeIndianRupee}
            tone={Number(fees.pending) > 0 ? 'warning' : 'default'}
            hint={`${fees.outstandingInvoices} unpaid invoices`}
            href="/fees"
          />
          <StatTile
            label="Upcoming exams"
            value={totals.upcomingExams}
            icon={CalendarClock}
            hint="Scheduled or running"
            href="/exams"
          />
          {summary.canViewActivity && (
            <StatTile
              label="Recent activity"
              value={summary.recentActivity.length}
              icon={ScrollText}
              hint="Changes in the audit trail"
              href="/audit-logs"
            />
          )}
        </div>
      </section>

      <section aria-label="Quick actions">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
          Quick actions
        </h2>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.filter((action) => can(action.module, 'VIEW')).map((action) => (
            <Button key={action.href} variant="outline" size="sm" asChild>
              <Link href={action.href}>
                <action.icon className="size-4" aria-hidden />
                {action.label}
              </Link>
            </Button>
          ))}
        </div>
      </section>

      <section aria-label="Charts" className="grid gap-4 lg:grid-cols-2">
        {charts.isPending ? (
          <>
            <Skeleton className="h-[318px] rounded-xl" />
            <Skeleton className="h-[318px] rounded-xl" />
          </>
        ) : charts.isError ? (
          <p className="text-muted-foreground text-sm">Charts could not be loaded.</p>
        ) : (
          <>
            <AttendanceTrendChart data={charts.data.attendanceTrend} />
            <FeeCollectionChart data={charts.data.feeCollection} />
            <StudentGrowthChart data={charts.data.studentGrowth} />
            <GenderDistributionChart data={charts.data.genderDistribution} />
            <DepartmentStatisticsChart data={charts.data.departmentStatistics} />
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <UpcomingExamsPanel exams={summary.upcomingExams} />
        {summary.canViewActivity && <RecentActivityPanel entries={summary.recentActivity} />}
      </div>
    </div>
  );
}

function UpcomingExamsPanel({ exams }: { exams: AdminSummary['upcomingExams'] }) {
  return (
    <section className="bg-card rounded-xl border p-5" aria-label="Upcoming exams">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Upcoming exams</h3>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/exams">View all</Link>
        </Button>
      </div>

      {exams.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          No exams scheduled.
        </p>
      ) : (
        <ul className="divide-y">
          {exams.map((exam) => (
            <li key={exam.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{exam.name}</p>
                <p className="text-muted-foreground text-xs">
                  {exam.class?.name ?? 'All classes'} · {formatDate(exam.startDate)}
                </p>
              </div>
              <Badge variant="outline">{exam.type.replace(/_/g, ' ')}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentActivityPanel({ entries }: { entries: AdminSummary['recentActivity'] }) {
  return (
    <section className="bg-card rounded-xl border p-5" aria-label="Recent activity">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recent activity</h3>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/audit-logs">View all</Link>
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y">
          {entries.map((entry) => (
            <li key={entry.id} className="py-2.5 first:pt-0 last:pb-0">
              <p className="text-sm">
                <span className="font-medium">{entry.actor}</span>{' '}
                <span className="text-muted-foreground">
                  {AUDIT_ACTION_LABELS[entry.action].toLowerCase()}
                </span>{' '}
                {entry.description ?? entry.module.replace(/_/g, ' ').toLowerCase()}
              </p>
              <p className="text-muted-foreground text-xs">{formatRelative(entry.at)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminDashboardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <StatTileSkeleton key={index} />
      ))}
    </div>
  );
}
