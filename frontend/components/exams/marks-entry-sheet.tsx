'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Save, UserX } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { examService } from '@/services/exam.service';
import type { MarkEntryPayload } from '@/types/exam';

interface MarkState {
  value: string;
  isAbsent: boolean;
}

export function MarksEntrySheet({ scheduleId }: { scheduleId: string }) {
  const queryClient = useQueryClient();
  const [marks, setMarks] = useState<Record<string, MarkState>>({});

  const query = useQuery({
    queryKey: ['exams', 'marks', scheduleId],
    queryFn: () => examService.getMarksSheet(scheduleId),
  });

  // Seed local state from the server whenever the sheet loads or reloads.
  useEffect(() => {
    if (!query.data) return;
    setMarks(
      Object.fromEntries(
        query.data.students.map((student) => [
          student.studentId,
          {
            value: student.marksObtained !== null ? String(Number(student.marksObtained)) : '',
            isAbsent: student.isAbsent,
          },
        ]),
      ),
    );
  }, [query.data]);

  const sheet = query.data;
  const maxMarks = sheet ? Number(sheet.schedule.maxMarks) : 0;
  const passingMarks = sheet ? Number(sheet.schedule.passingMarks) : 0;

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: MarkEntryPayload[] = Object.entries(marks)
        // Blank and not-absent means "not entered yet"; skip rather than send null.
        .filter(([, mark]) => mark.isAbsent || mark.value.trim() !== '')
        .map(([studentId, mark]) => ({
          studentId,
          isAbsent: mark.isAbsent,
          marksObtained: mark.isAbsent ? null : Number(mark.value),
        }));

      return examService.saveMarks(scheduleId, payload);
    },
    onSuccess: async () => {
      toast.success('Marks saved');
      await queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not save the marks');
    },
  });

  const stats = useMemo(() => {
    const entries = Object.values(marks);
    const entered = entries.filter((mark) => mark.isAbsent || mark.value.trim() !== '').length;
    const absent = entries.filter((mark) => mark.isAbsent).length;

    const numeric = entries
      .filter((mark) => !mark.isAbsent && mark.value.trim() !== '')
      .map((mark) => Number(mark.value))
      .filter((value) => Number.isFinite(value));

    const passed = numeric.filter((value) => value >= passingMarks).length;

    return {
      entered,
      total: entries.length,
      absent,
      passed,
      failed: numeric.length - passed,
      average:
        numeric.length === 0
          ? null
          : Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(2)),
    };
  }, [marks, passingMarks]);

  /** Rejects values above the paper maximum as the user types. */
  const setValue = (studentId: string, raw: string) => {
    if (raw !== '' && Number(raw) > maxMarks) return;
    setMarks((current) => ({
      ...current,
      [studentId]: { value: raw, isAbsent: false },
    }));
  };

  const toggleAbsent = (studentId: string, isAbsent: boolean) => {
    setMarks((current) => ({
      ...current,
      [studentId]: { value: isAbsent ? '' : (current[studentId]?.value ?? ''), isAbsent },
    }));
  };

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (query.error || !sheet) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const { schedule } = sheet;

  return (
    <div>
      <PageHeader
        title={`${schedule.subject.name} — marks entry`}
        description={`${schedule.examName} · ${schedule.className}${
          schedule.sectionName ? ` — ${schedule.sectionName}` : ''
        } · ${formatDate(schedule.examDate)}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Examinations', href: '/exams' },
          { label: schedule.examName, href: `/exams/${schedule.examId}` },
          { label: schedule.subject.name },
        ]}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/exams/${schedule.examId}`}>
                <ArrowLeft className="size-4" aria-hidden />
                Back to exam
              </Link>
            </Button>
            {!schedule.isLocked && (
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                <Save className="size-4" aria-hidden />
                {saveMutation.isPending ? 'Saving…' : 'Save marks'}
              </Button>
            )}
          </>
        }
      />

      {schedule.isLocked && (
        <Alert className="mb-4">
          <Lock className="size-4" aria-hidden />
          <AlertTitle>Results are published</AlertTitle>
          <AlertDescription>
            Marks are read-only. An administrator must withdraw the results before they can be
            corrected.
          </AlertDescription>
        </Alert>
      )}

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-4 pt-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="secondary">Max {maxMarks}</Badge>
            <Badge variant="secondary">Pass {passingMarks}</Badge>
            <StatusBadge status={schedule.examStatus} />
            <span className="text-muted-foreground">
              {stats.entered} of {stats.total} entered
            </span>
            {stats.average !== null && (
              <span className="text-muted-foreground">Average {stats.average}</span>
            )}
            {stats.passed + stats.failed > 0 && (
              <>
                <span className="text-success">{stats.passed} passed</span>
                <span className="text-destructive">{stats.failed} failed</span>
              </>
            )}
            {stats.absent > 0 && (
              <span className="text-warning">{stats.absent} absent</span>
            )}
          </div>

          <div className="w-full lg:w-56">
            <Progress
              value={stats.total === 0 ? 0 : (stats.entered / stats.total) * 100}
              className="h-2"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {sheet.students.map((student) => {
              const mark = marks[student.studentId] ?? { value: '', isAbsent: false };
              const numeric = mark.value === '' ? null : Number(mark.value);
              const hasFailed =
                !mark.isAbsent && numeric !== null && numeric < passingMarks;

              return (
                <li
                  key={student.studentId}
                  className={cn(
                    'flex flex-col gap-3 p-4 sm:flex-row sm:items-center',
                    !mark.isAbsent && mark.value === '' && 'bg-warning-muted/30',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {student.rollNumber ? `${student.rollNumber}. ` : ''}
                      {student.firstName} {student.lastName}
                    </p>
                    <p className="text-muted-foreground truncate text-sm">
                      {student.admissionNumber}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={mark.isAbsent}
                        disabled={schedule.isLocked}
                        onCheckedChange={(checked) =>
                          toggleAbsent(student.studentId, Boolean(checked))
                        }
                        aria-label={`Mark ${student.firstName} absent`}
                      />
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        <UserX className="size-3.5" aria-hidden />
                        Absent
                      </span>
                    </label>

                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={maxMarks}
                        step="0.5"
                        inputMode="decimal"
                        className={cn(
                          'w-24 text-right tabular-nums',
                          hasFailed && 'border-destructive text-destructive',
                        )}
                        value={mark.value}
                        disabled={mark.isAbsent || schedule.isLocked}
                        placeholder="—"
                        aria-label={`Marks for ${student.firstName} ${student.lastName}`}
                        onChange={(event) => setValue(student.studentId, event.target.value)}
                      />
                      <span className="text-muted-foreground text-sm tabular-nums">
                        / {maxMarks}
                      </span>
                    </div>

                    {student.grade && (
                      <Badge variant="outline" className="w-12 justify-center">
                        {student.grade}
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
