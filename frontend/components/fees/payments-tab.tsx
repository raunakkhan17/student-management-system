'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
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
import { formatCurrency, formatDateTime } from '@/lib/format';
import { feeService } from '@/services/fee.service';
import { PAYMENT_METHOD_LABELS, type PaymentMethod, type PaymentRecord } from '@/types/fee';

const ALL = '__all__';
const METHODS: PaymentMethod[] = [
  'CASH',
  'UPI',
  'CARD',
  'NET_BANKING',
  'CHEQUE',
  'BANK_TRANSFER',
  'DEMAND_DRAFT',
];

export function PaymentsTab() {
  const { can, hasRole } = useAuth();
  const table = useTableState({ defaultSortBy: 'paidAt', defaultSortOrder: 'desc' });
  const [methodFilter, setMethodFilter] = useState(ALL);

  const isSelfService = hasRole('STUDENT', 'PARENT');

  const params = {
    ...table.queryParams,
    ...(methodFilter !== ALL ? { method: methodFilter as PaymentMethod } : {}),
  };

  const query = useQuery({
    queryKey: ['fees', 'payments', params],
    queryFn: () => feeService.listPayments(params),
  });

  const exportMutation = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') => feeService.exportReport('collection', { format }),
    onSuccess: (blob, format) => {
      downloadBlob(blob, `fee-collection-${new Date().toISOString().slice(0, 10)}.${format}`);
      toast.success('Report downloaded');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not export the report');
    },
  });

  const columns: ColumnDef<PaymentRecord, unknown>[] = [
    {
      accessorKey: 'receiptNumber',
      header: 'Receipt',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.receiptNumber}</p>
          <p className="text-muted-foreground truncate text-sm">
            {row.original.invoice.invoiceNumber}
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
                <p className="truncate">
                  {row.original.student.user.firstName} {row.original.student.user.lastName}
                </p>
                <p className="text-muted-foreground truncate text-sm">
                  {row.original.student.admissionNumber}
                  {row.original.student.class ? ` · ${row.original.student.class.name}` : ''}
                </p>
              </div>
            ),
          } satisfies ColumnDef<PaymentRecord, unknown>,
        ]),
    {
      accessorKey: 'amount',
      header: 'Amount',
      meta: { sortKey: 'amount', cellClassName: 'text-right tabular-nums font-medium' },
      cell: ({ row }) => formatCurrency(row.original.amount),
    },
    {
      accessorKey: 'method',
      header: 'Method',
      meta: { hideOnMobile: true },
      cell: ({ row }) => PAYMENT_METHOD_LABELS[row.original.method],
    },
    {
      accessorKey: 'paidAt',
      header: 'Paid on',
      meta: { sortKey: 'paidAt', hideOnMobile: true },
      cell: ({ row }) => formatDateTime(row.original.paidAt),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'w-24' },
      cell: ({ row }) => (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/fees/receipts/${row.original.id}`}>Receipt</Link>
        </Button>
      ),
    },
  ];

  return (
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
          searchPlaceholder="Receipt, invoice or reference…"
          isFiltered={table.state.search.length > 0 || methodFilter !== ALL}
          onReset={() => {
            table.reset();
            setMethodFilter(ALL);
          }}
          filters={
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-[11rem]" aria-label="Filter by method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All methods</SelectItem>
                {METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          actions={
            can('FEES', 'EXPORT') && (
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
      }
      emptyState={
        <EmptyState
          icon={Receipt}
          title="No payments recorded"
          description="Payments appear here as soon as the finance office records them."
        />
      }
    />
  );
}
