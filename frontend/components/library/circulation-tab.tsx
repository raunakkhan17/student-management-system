'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  BookOpenCheck,
  IndianRupee,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/empty-state';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useTableState } from '@/hooks/use-table-state';
import { ApiError } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { libraryService } from '@/services/library.service';
import {
  TRANSACTION_STATUS_LABELS,
  type BookTransaction,
  type BookTransactionStatus,
} from '@/types/library';
import { ReturnBookDialog } from './return-book-dialog';

const ALL = '__all__';
const STATUSES: BookTransactionStatus[] = ['ACTIVE', 'OVERDUE', 'RETURNED', 'LOST', 'CANCELLED'];

export function CirculationTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const table = useTableState({ defaultSortBy: 'issueDate', defaultSortOrder: 'desc' });

  const [statusFilter, setStatusFilter] = useState(ALL);
  const [returnTarget, setReturnTarget] = useState<BookTransaction | null>(null);

  const params = {
    ...table.queryParams,
    ...(statusFilter === 'overdue'
      ? { onlyOverdue: true }
      : statusFilter !== ALL
        ? { status: statusFilter }
        : {}),
  };

  const query = useQuery({
    queryKey: ['library', 'transactions', params],
    queryFn: () => libraryService.listTransactions(params),
  });

  const renewMutation = useMutation({
    mutationFn: (id: string) => libraryService.renewBook(id, {}),
    onSuccess: async (loan) => {
      toast.success(`Renewed — now due ${formatDate(loan.dueDate)}`);
      await queryClient.invalidateQueries({ queryKey: ['library'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not renew the loan');
    },
  });

  const payFineMutation = useMutation({
    mutationFn: (id: string) => libraryService.payFine(id),
    onSuccess: async () => {
      toast.success('Fine settled');
      await queryClient.invalidateQueries({ queryKey: ['library'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not settle the fine');
    },
  });

  const refreshOverdueMutation = useMutation({
    mutationFn: () => libraryService.refreshOverdue(),
    onSuccess: async (result) => {
      toast.success(
        result.flagged === 0
          ? 'No loans are overdue'
          : `${result.flagged} loan(s) flagged — fines total ${formatCurrency(result.totalFines)}`,
      );
      await queryClient.invalidateQueries({ queryKey: ['library'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not refresh overdue loans');
    },
  });

  const isFiltered = table.state.search.length > 0 || statusFilter !== ALL;

  const columns = useMemo<ColumnDef<BookTransaction, unknown>[]>(
    () => [
      {
        id: 'book',
        header: 'Title',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.bookCopy.book.title}</p>
            <p className="text-muted-foreground truncate text-sm">
              {row.original.bookCopy.accessionNumber}
            </p>
          </div>
        ),
      },
      {
        id: 'member',
        header: 'Member',
        cell: ({ row }) => {
          const { member } = row.original;
          const identifier =
            member.studentProfile?.admissionNumber ?? member.teacherProfile?.employeeId ?? member.email;

          return (
            <div className="min-w-0">
              <p className="truncate font-medium">
                {member.firstName} {member.lastName}
              </p>
              <p className="text-muted-foreground truncate text-sm">{identifier}</p>
            </div>
          );
        },
      },
      {
        accessorKey: 'issueDate',
        header: 'Issued',
        meta: { sortKey: 'issueDate', hideOnMobile: true },
        cell: ({ row }) => formatDate(row.original.issueDate),
      },
      {
        accessorKey: 'dueDate',
        header: 'Due',
        meta: { sortKey: 'dueDate' },
        cell: ({ row }) => {
          const isOut = row.original.status === 'ACTIVE' || row.original.status === 'OVERDUE';
          const isLate = isOut && new Date(row.original.dueDate).getTime() < Date.now();

          return (
            <span className={cn(isLate && 'text-destructive font-medium')}>
              {formatDate(row.original.dueDate)}
            </span>
          );
        },
      },
      {
        accessorKey: 'fineAmount',
        header: 'Fine',
        meta: { sortKey: 'fineAmount', cellClassName: 'text-right tabular-nums' },
        cell: ({ row }) => {
          const fine = Number(row.original.fineAmount);
          if (fine === 0) return <span className="text-muted-foreground">—</span>;

          return (
            <span className={cn('font-medium', row.original.finePaid ? 'text-success' : 'text-destructive')}>
              {formatCurrency(row.original.fineAmount)}
              {row.original.finePaid ? ' paid' : ''}
            </span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            label={TRANSACTION_STATUS_LABELS[row.original.status]}
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        meta: { cellClassName: 'w-12' },
        cell: ({ row }) => {
          const loan = row.original;
          const isOut = loan.status === 'ACTIVE' || loan.status === 'OVERDUE';
          const owesFine = Number(loan.fineAmount) > 0 && !loan.finePaid;

          if (!isOut && !owesFine) {
            return <span className="text-muted-foreground text-sm">—</span>;
          }

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Row actions">
                  <MoreHorizontal className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOut && can('LIBRARY', 'ASSIGN') && (
                  <>
                    <DropdownMenuItem onClick={() => setReturnTarget(loan)}>
                      <Undo2 className="size-4" aria-hidden />
                      Record return
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={renewMutation.isPending}
                      onClick={() => renewMutation.mutate(loan.id)}
                    >
                      <RotateCcw className="size-4" aria-hidden />
                      Renew
                    </DropdownMenuItem>
                  </>
                )}

                {owesFine && can('LIBRARY', 'APPROVE') && (
                  <DropdownMenuItem
                    disabled={payFineMutation.isPending}
                    onClick={() => payFineMutation.mutate(loan.id)}
                  >
                    <IndianRupee className="size-4" aria-hidden />
                    Collect fine
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [can, payFineMutation, renewMutation],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        {...(query.data ? { pagination: query.data.pagination } : {})}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        sortBy={table.state.sortBy}
        sortOrder={table.state.sortOrder}
        onSortChange={table.toggleSort}
        onPageChange={table.setPage}
        onLimitChange={table.setLimit}
        getRowId={(row) => row.id}
        toolbar={
          <DataTableToolbar
            search={table.state.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Title, accession number or member…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setStatusFilter(ALL);
            }}
            filters={
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[11rem]" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All loans</SelectItem>
                  <SelectItem value="overdue">Past due</SelectItem>
                  {STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {TRANSACTION_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            actions={
              can('LIBRARY', 'EDIT') && (
                <Button
                  variant="outline"
                  disabled={refreshOverdueMutation.isPending}
                  onClick={() => refreshOverdueMutation.mutate()}
                >
                  <RefreshCw
                    className={cn('size-4', refreshOverdueMutation.isPending && 'animate-spin')}
                    aria-hidden
                  />
                  Refresh overdue
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={BookOpenCheck}
            title={isFiltered ? 'No matching loans' : 'Nothing has been issued yet'}
            description={
              isFiltered
                ? 'Try a different filter or search term.'
                : 'Issued books appear here with their due dates and fines.'
            }
          />
        }
      />

      <ReturnBookDialog
        loan={returnTarget}
        onOpenChange={(open) => {
          if (!open) setReturnTarget(null);
        }}
      />
    </>
  );
}
