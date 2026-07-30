'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, MoreHorizontal, Plus, ReceiptIndianRupee, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import { downloadBlob } from '@/lib/download';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { academicService } from '@/services/academic.service';
import { feeService } from '@/services/fee.service';
import { INVOICE_STATUS_LABELS, type Invoice, type InvoiceStatus } from '@/types/fee';
import { RecordPaymentDialog } from './record-payment-dialog';

const ALL = '__all__';
const STATUSES: InvoiceStatus[] = [
  'PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'WAIVED',
];

export function InvoicesList() {
  const router = useRouter();
  const { can, hasRole } = useAuth();
  const table = useTableState({ defaultSortBy: 'issueDate', defaultSortOrder: 'desc' });

  const [classFilter, setClassFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);

  const isSelfService = hasRole('STUDENT', 'PARENT');

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
    enabled: !isSelfService,
  });

  const params = {
    ...table.queryParams,
    ...(classFilter !== ALL ? { classId: classFilter } : {}),
    ...(statusFilter !== ALL ? { status: statusFilter } : {}),
  };

  const query = useQuery({
    queryKey: ['fees', 'invoices', params],
    queryFn: () => feeService.listInvoices(params),
  });

  const exportMutation = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') =>
      feeService.exportReport('outstanding', {
        ...(classFilter !== ALL ? { classId: classFilter } : {}),
        format,
      }),
    onSuccess: (blob, format) => {
      downloadBlob(blob, `outstanding-fees-${new Date().toISOString().slice(0, 10)}.${format}`);
      toast.success('Report downloaded');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not export the report');
    },
  });

  const isFiltered = table.state.search.length > 0 || classFilter !== ALL || statusFilter !== ALL;

  const columns = useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      {
        accessorKey: 'invoiceNumber',
        header: 'Invoice',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.invoiceNumber}</p>
            <p className="text-muted-foreground truncate text-sm">
              Issued {formatDate(row.original.issueDate)}
            </p>
          </div>
        ),
      },
      ...(isSelfService
        ? []
        : [
            {
              id: 'student',
              header: 'Student',
              cell: ({ row }) => (
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {row.original.student.user.firstName} {row.original.student.user.lastName}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {row.original.student.admissionNumber}
                    {row.original.student.class ? ` · ${row.original.student.class.name}` : ''}
                  </p>
                </div>
              ),
            } satisfies ColumnDef<Invoice, unknown>,
          ]),
      {
        accessorKey: 'totalAmount',
        header: 'Total',
        meta: { sortKey: 'totalAmount', cellClassName: 'text-right tabular-nums' },
        cell: ({ row }) => formatCurrency(row.original.totalAmount),
      },
      {
        accessorKey: 'balanceAmount',
        header: 'Outstanding',
        meta: { sortKey: 'balanceAmount', cellClassName: 'text-right tabular-nums' },
        cell: ({ row }) => {
          const balance = Number(row.original.balanceAmount);
          return (
            <span className={cn('font-medium', balance > 0 ? 'text-destructive' : 'text-success')}>
              {formatCurrency(row.original.balanceAmount)}
            </span>
          );
        },
      },
      {
        accessorKey: 'dueDate',
        header: 'Due',
        meta: { sortKey: 'dueDate', hideOnMobile: true },
        cell: ({ row }) => {
          const isOverdue =
            new Date(row.original.dueDate).getTime() < Date.now() &&
            Number(row.original.balanceAmount) > 0;
          return (
            <span className={cn(isOverdue && 'text-destructive font-medium')}>
              {formatDate(row.original.dueDate)}
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
            label={INVOICE_STATUS_LABELS[row.original.status]}
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        meta: { cellClassName: 'w-12' },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Row actions"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              <DropdownMenuItem onClick={() => router.push(`/fees/invoices/${row.original.id}`)}>
                View invoice
              </DropdownMenuItem>

              {can('FEES', 'CREATE') &&
                Number(row.original.balanceAmount) > 0 &&
                row.original.status !== 'CANCELLED' && (
                  <DropdownMenuItem onClick={() => setPaymentTarget(row.original)}>
                    <Wallet className="size-4" aria-hidden />
                    Record payment
                  </DropdownMenuItem>
                )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [isSelfService, can, router],
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
        onRowClick={(row) => router.push(`/fees/invoices/${row.id}`)}
        toolbar={
          <DataTableToolbar
            search={table.state.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Invoice number, student name or admission no.…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setClassFilter(ALL);
              setStatusFilter(ALL);
            }}
            filters={
              <>
                {!isSelfService && (
                  <Select value={classFilter} onValueChange={setClassFilter}>
                    <SelectTrigger className="w-[10rem]" aria-label="Filter by class">
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
                )}

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[10rem]" aria-label="Filter by status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {INVOICE_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              <>
                {can('FEES', 'EXPORT') && (
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
                )}

                {can('FEES', 'CREATE') && (
                  <Button onClick={() => router.push('/fees/invoices/new')}>
                    <Plus className="size-4" aria-hidden />
                    Issue invoices
                  </Button>
                )}
              </>
            }
          />
        }
        emptyState={
          <EmptyState
            icon={ReceiptIndianRupee}
            title={isFiltered ? 'No matching invoices' : 'No invoices yet'}
            description={
              isSelfService
                ? 'No fees have been billed to you yet.'
                : 'Issue invoices from a fee structure to start collecting.'
            }
          />
        }
      />

      <RecordPaymentDialog
        invoice={paymentTarget}
        onOpenChange={(open) => {
          if (!open) setPaymentTarget(null);
        }}
        onRecorded={() => void query.refetch()}
      />
    </>
  );
}
