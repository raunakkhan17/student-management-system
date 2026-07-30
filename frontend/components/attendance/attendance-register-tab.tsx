'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarRange, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { downloadBlob } from '@/lib/download';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { academicService } from '@/services/academic.service';
import { attendanceService } from '@/services/attendance.service';

const ALL = '__all__';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Colour the percentage cell by how far below the 75% threshold it sits. */
function percentTone(percentage: number | null): string {
  if (percentage === null) return 'text-muted-foreground';
  if (percentage >= 75) return 'text-success';
  if (percentage >= 60) return 'text-warning';
  return 'text-destructive';
}

export function AttendanceRegisterTab() {
  const { can } = useAuth();
  const now = new Date();

  const [classId, setClassId] = useState(ALL);
  const [sectionId, setSectionId] = useState(ALL);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
  });

  const sectionChoices = useMemo(
    () => classOptions.data?.find((option) => option.id === classId)?.sections ?? [],
    [classOptions.data, classId],
  );

  const query = useQuery({
    queryKey: ['attendance', 'monthly', { classId, sectionId, year, month }],
    queryFn: () =>
      attendanceService.getMonthly({
        ...(classId !== ALL ? { classId } : {}),
        ...(sectionId !== ALL ? { sectionId } : {}),
        year,
        month,
      }),
  });

  const exportMutation = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') => {
      const from = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
      const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      return attendanceService.exportReport({
        ...(classId !== ALL ? { classId } : {}),
        ...(sectionId !== ALL ? { sectionId } : {}),
        from,
        to,
        format,
      });
    },
    onSuccess: (blob, format) => {
      downloadBlob(blob, `attendance-${year}-${String(month).padStart(2, '0')}.${format}`);
      toast.success('Report downloaded');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not export the report');
    },
  });

  const rows = query.data?.students ?? [];

  const aggregate = useMemo(() => {
    const withData = rows.filter((row) => row.percentage !== null);
    const average =
      withData.length === 0
        ? null
        : withData.reduce((sum, row) => sum + (row.percentage ?? 0), 0) / withData.length;

    return {
      studentCount: rows.length,
      average,
      belowThreshold: withData.filter((row) => (row.percentage ?? 0) < 75).length,
      sessionsMarked: rows.reduce((sum, row) => sum + row.totalMarked, 0),
    };
  }, [rows]);

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div>
      <PageHeader
        title="Monthly register"
        description="Per-student attendance for a calendar month, with the institutional 75% threshold applied."
        actions={
          can('ATTENDANCE', 'EXPORT') && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={exportMutation.isPending}>
                  <Download className="size-4" aria-hidden />
                  {exportMutation.isPending ? 'Exporting…' : 'Export'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportMutation.mutate('xlsx')}>
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportMutation.mutate('csv')}>
                  CSV (.csv)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <label htmlFor="register-class" className="text-sm font-medium">
              Class
            </label>
            <Select
              value={classId}
              onValueChange={(value) => {
                setClassId(value);
                setSectionId(ALL);
              }}
            >
              <SelectTrigger id="register-class" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All classes</SelectItem>
                {(classOptions.data ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="register-section" className="text-sm font-medium">
              Section
            </label>
            <Select value={sectionId} onValueChange={setSectionId} disabled={classId === ALL}>
              <SelectTrigger id="register-section" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sections</SelectItem>
                {sectionChoices.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="register-month" className="text-sm font-medium">
              Month
            </label>
            <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
              <SelectTrigger id="register-month" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((name, index) => (
                  <SelectItem key={name} value={String(index + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="register-year" className="text-sm font-medium">
              Year
            </label>
            <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
              <SelectTrigger id="register-year" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Students"
          value={aggregate.studentCount}
          isLoading={query.isLoading}
          tone="primary"
        />
        <StatCard
          label="Average attendance"
          value={aggregate.average === null ? '—' : formatPercent(aggregate.average)}
          isLoading={query.isLoading}
          tone="info"
        />
        <StatCard
          label="Below 75%"
          value={aggregate.belowThreshold}
          isLoading={query.isLoading}
          tone="danger"
          hint="Short of the attendance requirement"
        />
        <StatCard
          label="Sessions marked"
          value={aggregate.sessionsMarked}
          isLoading={query.isLoading}
          tone="success"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : query.error ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="No attendance recorded"
              description="Nothing has been marked for this class and month yet."
            />
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="whitespace-nowrap">Student</TableHead>
                    <TableHead className="text-right">Present</TableHead>
                    <TableHead className="text-right">Late</TableHead>
                    <TableHead className="text-right">Half day</TableHead>
                    <TableHead className="text-right">Absent</TableHead>
                    <TableHead className="text-right">Leave</TableHead>
                    <TableHead className="text-right">Marked</TableHead>
                    <TableHead className="min-w-40">Attendance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {row.rollNumber ? `${row.rollNumber}. ` : ''}
                            {row.firstName} {row.lastName}
                          </p>
                          <p className="text-muted-foreground truncate text-sm">
                            {row.admissionNumber}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.counts.PRESENT}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.counts.LATE}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.counts.HALF_DAY}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.counts.ABSENT}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.counts.LEAVE}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.totalMarked}</TableCell>
                      <TableCell>
                        <div className="space-y-1.5">
                          <span
                            className={cn(
                              'text-sm font-semibold tabular-nums',
                              percentTone(row.percentage),
                            )}
                          >
                            {row.percentage === null ? '—' : formatPercent(row.percentage)}
                          </span>
                          <Progress value={row.percentage ?? 0} className="h-1.5" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
