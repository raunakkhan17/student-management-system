'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { StatusBadge } from '@/components/common/status-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { libraryService } from '@/services/library.service';

/** A borrower's own loans, with the accruing fine made explicit. */
export function MyLoansPanel() {
  const query = useQuery({
    queryKey: ['library', 'my-loans'],
    queryFn: () => libraryService.getMyLoans(),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (query.error) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const summary = query.data;

  if (!summary || summary.loans.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="You have no books out"
        description={
          summary
            ? `You may borrow up to ${summary.limit} book(s) at a time.`
            : 'Borrowed books appear here with their due dates.'
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {summary.onLoan} of {summary.limit} book(s) currently out.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {summary.loans.map((loan) => {
          const isLate = loan.daysOverdue > 0;

          return (
            <Card key={loan.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">
                      {loan.bookCopy.book.title}
                    </CardTitle>
                    <CardDescription className="truncate">
                      {loan.bookCopy.book.authors.map((link) => link.author.name).join(', ') ||
                        loan.bookCopy.book.isbn}
                    </CardDescription>
                  </div>
                  <StatusBadge status={isLate ? 'OVERDUE' : 'ACTIVE'} label={isLate ? 'Overdue' : 'On loan'} />
                </div>
              </CardHeader>

              <CardContent>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Issued</dt>
                    <dd className="font-medium">{formatDate(loan.issueDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Due</dt>
                    <dd className={cn('font-medium', isLate && 'text-destructive')}>
                      {formatDate(loan.dueDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Copy</dt>
                    <dd className="font-medium">{loan.bookCopy.accessionNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Fine accrued</dt>
                    <dd className={cn('font-medium', isLate && 'text-destructive')}>
                      {Number(loan.accruedFine) > 0 ? formatCurrency(loan.accruedFine) : '—'}
                    </dd>
                  </div>
                </dl>

                {isLate && (
                  <p className="text-destructive mt-3 text-sm">
                    {loan.daysOverdue} day(s) overdue. Please return this book.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
