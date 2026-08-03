'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { attendanceService } from '@/services/attendance.service';
import { ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from '@/types/attendance';

/** Reads as a risk signal below the institution's usual 75% requirement. */
const SHORTFALL_THRESHOLD = 75;

const STATUS_VARIANT: Record<AttendanceStatus, 'default' | 'secondary' | 'destructive' | 'outline'> =
  {
    PRESENT: 'default',
    ABSENT: 'destructive',
    LATE: 'secondary',
    HALF_DAY: 'secondary',
    LEAVE: 'outline',
    HOLIDAY: 'outline',
  };

export function StudentAttendanceTab({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: ['students', studentId, 'attendance'],
    queryFn: () => attendanceService.getStudentAttendance(studentId),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (query.error || !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const { summary, totalMarked, percentage, records } = query.data;
  const isShort = percentage !== null && percentage < SHORTFALL_THRESHOLD;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Attendance summary</CardTitle>
          <CardDescription>
            {totalMarked === 0
              ? 'No sessions marked for this student yet.'
              : `Across ${totalMarked} marked sessions this academic year.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Overall
              </p>
              <p
                className={`mt-1 text-3xl font-semibold ${isShort ? 'text-destructive' : ''}`}
              >
                {percentage === null ? '—' : `${percentage}%`}
              </p>
              {isShort && (
                <p className="text-destructive mt-1 text-xs">
                  Below the {SHORTFALL_THRESHOLD}% requirement
                </p>
              )}
            </div>

            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              {(Object.keys(ATTENDANCE_STATUS_LABELS) as AttendanceStatus[])
                .filter((status) => (summary[status] ?? 0) > 0)
                .map((status) => (
                  <div key={status}>
                    <dt className="text-muted-foreground text-xs">
                      {ATTENDANCE_STATUS_LABELS[status]}
                    </dt>
                    <dd className="mt-0.5 text-lg font-medium tabular-nums">
                      {summary[status] ?? 0}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session history</CardTitle>
          <CardDescription>Most recent first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No attendance recorded"
              description="Sessions appear here once a register including this student is submitted."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(record.date)}</TableCell>
                    <TableCell>{record.subject?.name ?? 'Daily register'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {record.period?.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[record.status]}>
                        {ATTENDANCE_STATUS_LABELS[record.status]}
                        {record.minutesLate ? ` · ${record.minutesLate}m` : ''}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {record.remarks ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
