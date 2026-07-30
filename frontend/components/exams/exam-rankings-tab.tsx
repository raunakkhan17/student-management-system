'use client';

import { useQuery } from '@tanstack/react-query';
import { Medal, Trophy } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
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
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { examService } from '@/services/exam.service';

/** Medal tint for the top three ranks. */
function rankTone(rank: number | null): string {
  if (rank === 1) return 'text-warning';
  if (rank === 2) return 'text-muted-foreground';
  if (rank === 3) return 'text-warning/70';
  return 'text-muted-foreground';
}

export function ExamRankingsTab({ examId }: { examId: string }) {
  const query = useQuery({
    queryKey: ['exams', examId, 'rankings'],
    queryFn: () => examService.getRankings(examId),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (query.error) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const rankings = query.data ?? [];

  if (rankings.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Trophy}
            title="No rankings yet"
            description="Rankings are computed when results are published."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-16">Rank</TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="hidden md:table-cell">Class</TableHead>
                <TableHead className="text-right">Marks</TableHead>
                <TableHead className="text-right">Percentage</TableHead>
                <TableHead className="text-center">Grade</TableHead>
                <TableHead className="hidden text-right md:table-cell">GPA</TableHead>
                <TableHead className="text-center">Result</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rankings.map((row) => (
                <TableRow key={row.studentId}>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 font-semibold tabular-nums',
                        rankTone(row.rank),
                      )}
                    >
                      {row.rank !== null && row.rank <= 3 && (
                        <Medal className="size-4" aria-hidden />
                      )}
                      {row.rank ?? '—'}
                    </span>
                  </TableCell>

                  <TableCell>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="text-muted-foreground truncate text-sm">
                        {row.admissionNumber}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell className="hidden md:table-cell">
                    {row.className ?? '—'}
                    {row.sectionName ? ` — ${row.sectionName}` : ''}
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {Number(row.obtainedMarks)} / {Number(row.totalMarks)}
                  </TableCell>

                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatPercent(row.percentage)}
                  </TableCell>

                  <TableCell className="text-center">
                    {row.grade ? <Badge variant="outline">{row.grade}</Badge> : '—'}
                  </TableCell>

                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {row.gpa === null ? '—' : Number(row.gpa).toFixed(2)}
                  </TableCell>

                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        'border-transparent',
                        row.isPass
                          ? 'bg-success-muted text-success'
                          : 'bg-destructive-muted text-destructive',
                      )}
                    >
                      {row.isPass ? 'Pass' : 'Fail'}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/exams/${examId}/report-card/${row.studentId}`}>
                        Report card
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
