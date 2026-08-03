'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bus,
  ClipboardCheck,
  Download,
  GraduationCap,
  Home,
  Library,
  ReceiptIndianRupee,
  ScrollText,
  UsersRound,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { downloadBlob } from '@/lib/download';
import { academicService } from '@/services/academic.service';
import { downloadReport, type ReportFormat, type ReportParams } from '@/services/report.service';
import type { AppModule } from '@/types/enums';

/** Filters a report understands. Anything not listed is never sent to it. */
type Filter = 'range' | 'class';

interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  path: string;
  module: AppModule;
  icon: LucideIcon;
  filters: Filter[];
  /** The endpoint rejects the request without a date range. */
  requiresRange?: boolean;
}

/**
 * PRD Module 18. Every entry points at an endpoint owned by its module — this
 * page is a catalogue, not a second reporting implementation.
 */
const REPORTS: ReportDefinition[] = [
  {
    id: 'students',
    name: 'Student report',
    description: 'Enrolment register with class, section, guardian and contact details.',
    path: '/students/export',
    module: 'STUDENTS',
    icon: GraduationCap,
    filters: ['class'],
  },
  {
    id: 'teachers',
    name: 'Teacher report',
    description: 'Staff register with department, qualification, subjects and joining date.',
    path: '/teachers/export',
    module: 'TEACHERS',
    icon: UsersRound,
    filters: [],
  },
  {
    id: 'attendance',
    name: 'Attendance report',
    description: 'Per-student attendance across a date range, with present and absent counts.',
    path: '/attendance/report',
    module: 'ATTENDANCE',
    icon: ClipboardCheck,
    filters: ['range', 'class'],
    requiresRange: true,
  },
  {
    id: 'exams',
    name: 'Exam results report',
    description: 'Marks per student per paper, with grade and pass or fail outcome.',
    path: '/exams/reports/results',
    module: 'EXAMS',
    icon: ScrollText,
    filters: ['class'],
  },
  {
    id: 'fee-collection',
    name: 'Fee collection report',
    description: 'Payments received, by student, method and date.',
    path: '/fees/reports/collection',
    module: 'FEES',
    icon: Wallet,
    filters: ['range', 'class'],
  },
  {
    id: 'fee-outstanding',
    name: 'Outstanding fees report',
    description: 'Unpaid and overdue balances per student.',
    path: '/fees/reports/outstanding',
    module: 'FEES',
    icon: ReceiptIndianRupee,
    filters: ['class'],
  },
  {
    id: 'library',
    name: 'Library catalogue report',
    description: 'Titles, copies, availability and shelf location.',
    path: '/library/reports/catalogue',
    module: 'LIBRARY',
    icon: Library,
    filters: [],
  },
  {
    id: 'hostel',
    name: 'Hostel occupancy report',
    description: 'Rooms, allocations and vacancies by hostel block.',
    path: '/hostel/reports/occupancy',
    module: 'HOSTEL',
    icon: Home,
    filters: [],
  },
  {
    id: 'transport',
    name: 'Transport riders report',
    description: 'Students allocated to each route, stop and vehicle.',
    path: '/transport/reports/riders',
    module: 'TRANSPORT',
    icon: Bus,
    filters: [],
  },
];

export function ReportsHub() {
  const { can } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [classId, setClassId] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);

  const classes = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
  });

  // A report is listed only if the caller may export the module that owns it.
  const available = REPORTS.filter((report) => can(report.module, 'EXPORT'));

  async function run(report: ReportDefinition, format: ReportFormat) {
    if (report.requiresRange && (!from || !to)) {
      toast.error(`${report.name} needs a date range.`);
      return;
    }

    setBusy(`${report.id}:${format}`);
    try {
      const params: ReportParams = { format };
      if (report.filters.includes('range')) {
        if (from) params.from = from;
        if (to) params.to = to;
      }
      if (report.filters.includes('class') && classId !== 'all') {
        params.classId = classId;
      }

      const blob = await downloadReport(report.path, params);
      downloadBlob(blob, `${report.id}-${new Date().toISOString().slice(0, 10)}.${format}`);
      toast.success(`${report.name} downloaded.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The report could not be generated.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Export institutional data as CSV or Excel."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Reports' }]}
      />

      {/* One filter row above everything it scopes — each report uses only the
          filters it declares, and ignores the rest. */}
      <Card className="mb-6">
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="report-from">From</Label>
            <Input
              id="report-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-to">To</Label>
            <Input
              id="report-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-class">Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger id="report-class">
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {(classes.data ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setFrom('');
                setTo('');
                setClassId('all');
              }}
              disabled={!from && !to && classId === 'all'}
            >
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {available.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          You do not have export permission for any module.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {available.map((report) => (
            <Card key={report.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <span className="bg-primary-muted text-primary grid size-9 shrink-0 place-items-center rounded-lg">
                    <report.icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="text-base">{report.name}</CardTitle>
                    <CardDescription className="mt-1">{report.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="mt-auto">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void run(report, 'xlsx')}
                    disabled={busy !== null}
                  >
                    <Download className="size-4" aria-hidden />
                    {busy === `${report.id}:xlsx` ? 'Preparing…' : 'Excel'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void run(report, 'csv')}
                    disabled={busy !== null}
                  >
                    <Download className="size-4" aria-hidden />
                    {busy === `${report.id}:csv` ? 'Preparing…' : 'CSV'}
                  </Button>
                  {report.requiresRange && (
                    <span className="text-muted-foreground text-xs">Needs a date range</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
