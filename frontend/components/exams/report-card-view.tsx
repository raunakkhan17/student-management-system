'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { examService } from '@/services/exam.service';
import { EXAM_TYPE_LABELS } from '@/types/exam';

interface ReportCardViewProps {
  examId: string;
  studentId: string;
}

/** Printable report card (PRD Module 7 — Generate Report Cards). */
export function ReportCardView({ examId, studentId }: ReportCardViewProps) {
  const query = useQuery({
    queryKey: ['exams', 'results', studentId, examId],
    queryFn: () => examService.getStudentResult(studentId, examId),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-[36rem] w-full" />
      </div>
    );
  }

  if (query.error || !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const { institution, card, subjects } = query.data;
  const studentName = `${card.student.user.firstName} ${card.student.user.lastName}`;

  return (
    <div>
      {/* Chrome is hidden when printing so only the card reaches the page. */}
      <div className="print:hidden">
        <PageHeader
          title="Report card"
          description={`${studentName} · ${card.exam.name}`}
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Examinations', href: '/exams' },
            { label: card.exam.name, href: `/exams/${examId}` },
            { label: 'Report card' },
          ]}
          actions={
            <>
              <Button asChild variant="outline">
                <Link href={`/exams/${examId}`}>
                  <ArrowLeft className="size-4" aria-hidden />
                  Back to exam
                </Link>
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden />
                Print
              </Button>
            </>
          }
        />
      </div>

      <Card className="mx-auto max-w-4xl print:border-0 print:shadow-none">
        <CardContent className="space-y-6 pt-6">
          {/* ------------------------------------------------------- Masthead */}
          <header className="space-y-1 border-b pb-5 text-center">
            <h1 className="text-xl font-semibold tracking-tight">
              {institution?.name ?? 'EduCore Institute'}
            </h1>
            <p className="text-muted-foreground text-sm">
              {card.exam.name} · {EXAM_TYPE_LABELS[card.exam.type]} · {card.academicYear.name}
            </p>
            <p className="text-muted-foreground text-xs">
              {formatDate(card.exam.startDate)} – {formatDate(card.exam.endDate)}
            </p>
          </header>

          {/* -------------------------------------------------- Student block */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Student</dt>
              <dd className="font-medium">{studentName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Admission no.</dt>
              <dd className="font-medium">{card.student.admissionNumber}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Class</dt>
              <dd className="font-medium">
                {card.student.class?.name ?? '—'}
                {card.student.section ? ` — ${card.student.section.name}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Roll no.</dt>
              <dd className="font-medium">{card.student.rollNumber ?? '—'}</dd>
            </div>
          </dl>

          {/* ------------------------------------------------ Subject results */}
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                  <TableHead className="text-right">Pass</TableHead>
                  <TableHead className="text-right">Obtained</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                  <TableHead className="text-center">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.map((row) => (
                  <TableRow key={row.subject.id}>
                    <TableCell>
                      <span className="font-medium">{row.subject.name}</span>
                      <span className="text-muted-foreground ml-1.5 text-xs">
                        {row.subject.code}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(row.maxMarks)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(row.passingMarks)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {row.isAbsent ? (
                        <span className="text-warning">Absent</span>
                      ) : (
                        Number(row.marksObtained ?? 0)
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.grade ? <Badge variant="outline">{row.grade}</Badge> : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          row.isPass ? 'text-success' : 'text-destructive',
                        )}
                      >
                        {row.isPass ? 'Pass' : 'Fail'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* ---------------------------------------------------- Totals block */}
          <div className="grid gap-4 border-t pt-5 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="text-muted-foreground text-sm">Total</p>
              <p className="text-lg font-semibold tabular-nums">
                {Number(card.obtainedMarks)} / {Number(card.totalMarks)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Percentage</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatPercent(card.percentage)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Grade</p>
              <p className="text-lg font-semibold">{card.grade ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">GPA</p>
              <p className="text-lg font-semibold tabular-nums">
                {card.gpa === null ? '—' : Number(card.gpa).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Rank</p>
              <p className="text-lg font-semibold tabular-nums">{card.rank ?? '—'}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t pt-5">
            <Badge
              variant="outline"
              className={cn(
                'border-transparent text-base',
                card.isPass
                  ? 'bg-success-muted text-success'
                  : 'bg-destructive-muted text-destructive',
              )}
            >
              {card.isPass ? 'PASS' : 'FAIL'}
            </Badge>

            {card.attendancePercent !== null && (
              <span className="text-muted-foreground text-sm">
                Attendance: {formatPercent(card.attendancePercent)}
              </span>
            )}

            {card.remarks && <p className="text-sm">{card.remarks}</p>}
          </div>

          <footer className="text-muted-foreground flex flex-wrap justify-between gap-4 border-t pt-5 text-xs">
            <span>
              {card.publishedAt
                ? `Published ${formatDate(card.publishedAt)}`
                : 'Provisional — not yet published'}
            </span>
            {institution?.principalName && <span>{institution.principalName}, Principal</span>}
          </footer>
        </CardContent>
      </Card>
    </div>
  );
}
