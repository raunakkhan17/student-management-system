'use client';

import { useQuery } from '@tanstack/react-query';
import { Library } from 'lucide-react';
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
import { formatCurrency, formatDate } from '@/lib/format';
import { libraryService } from '@/services/library.service';

/**
 * Library membership is keyed on the user account, not the student record —
 * staff and students borrow through the same circulation desk.
 */
export function StudentLibraryTab({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: ['library', 'members', userId, 'loans'],
    queryFn: () => libraryService.getMemberLoans(userId),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (query.error || !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const { limit, onLoan, loans } = query.data;
  const overdue = loans.filter((loan) => loan.daysOverdue > 0);
  const totalFine = loans.reduce((sum, loan) => sum + Number(loan.accruedFine), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Borrowing</CardTitle>
          <CardDescription>
            {onLoan} of {limit} allowed titles currently on loan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-wrap gap-x-12 gap-y-4">
            <div>
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                On loan
              </dt>
              <dd className="mt-1 text-2xl font-semibold">{onLoan}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Overdue
              </dt>
              <dd
                className={`mt-1 text-2xl font-semibold ${overdue.length > 0 ? 'text-destructive' : ''}`}
              >
                {overdue.length}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Accrued fines
              </dt>
              <dd
                className={`mt-1 text-2xl font-semibold ${totalFine > 0 ? 'text-destructive' : ''}`}
              >
                {formatCurrency(totalFine)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current loans</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loans.length === 0 ? (
            <EmptyState
              icon={Library}
              title="Nothing on loan"
              description="Books issued to this student will appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Accession</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Fine</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.map((loan) => (
                  <TableRow key={loan.id}>
                    <TableCell className="font-medium">
                      {loan.bookCopy?.book?.title ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {loan.bookCopy?.accessionNumber ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(loan.issueDate)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(loan.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(loan.accruedFine) > 0 ? formatCurrency(loan.accruedFine) : '—'}
                    </TableCell>
                    <TableCell>
                      {loan.daysOverdue > 0 ? (
                        <Badge variant="destructive">
                          {loan.daysOverdue} day{loan.daysOverdue === 1 ? '' : 's'} overdue
                        </Badge>
                      ) : (
                        <Badge variant="outline">On time</Badge>
                      )}
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
