'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleOff, Download, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
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
import { transportService } from '@/services/transport.service';
import type { TransportAllocation } from '@/types/transport';

const ALL = '__all__';

export function RidersTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const table = useTableState({ defaultSortBy: 'startDate', defaultSortOrder: 'desc' });

  const [routeFilter, setRouteFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const endTarget = useConfirmTarget<TransportAllocation>();

  const routes = useQuery({
    queryKey: ['transport', 'routes', 'options'],
    queryFn: () => transportService.listRoutes({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
    select: (page) => page.items,
  });

  const params = {
    ...table.queryParams,
    ...(routeFilter !== ALL ? { routeId: routeFilter } : {}),
    status: statusFilter,
  };

  const query = useQuery({
    queryKey: ['transport', 'allocations', params],
    queryFn: () => transportService.listAllocations(params),
  });

  const endMutation = useMutation({
    mutationFn: (allocation: TransportAllocation) =>
      transportService.endAllocation(allocation.id, new Date().toISOString().slice(0, 10)),
    onSuccess: async () => {
      toast.success('Allocation closed');
      await queryClient.invalidateQueries({ queryKey: ['transport'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not close the allocation');
    },
  });

  const exportMutation = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') =>
      transportService.exportRiders({
        ...(routeFilter !== ALL ? { routeId: routeFilter } : {}),
        format,
      }),
    onSuccess: (blob, format) => {
      downloadBlob(blob, `transport-riders-${new Date().toISOString().slice(0, 10)}.${format}`);
      toast.success('Rider list downloaded');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not export the rider list');
    },
  });

  const isFiltered =
    table.state.search.length > 0 || routeFilter !== ALL || statusFilter !== 'ACTIVE';

  const columns = useMemo<ColumnDef<TransportAllocation, unknown>[]>(
    () => [
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
      },
      {
        id: 'route',
        header: 'Route & stop',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">
              {row.original.route.name}
              <span className="text-muted-foreground ml-2 text-sm">{row.original.route.code}</span>
            </p>
            <p className="text-muted-foreground truncate text-sm">
              {row.original.stop.sequence}. {row.original.stop.name} ·{' '}
              {row.original.stop.pickupTime} / {row.original.stop.dropTime}
            </p>
          </div>
        ),
      },
      {
        id: 'vehicle',
        header: 'Vehicle',
        meta: { hideOnMobile: true },
        cell: ({ row }) =>
          row.original.route.vehicle ? (
            row.original.route.vehicle.registrationNumber
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          ),
      },
      {
        accessorKey: 'startDate',
        header: 'From',
        meta: { sortKey: 'startDate', hideOnMobile: true },
        cell: ({ row }) => formatDate(row.original.startDate),
      },
      {
        accessorKey: 'fare',
        header: 'Fare',
        meta: { cellClassName: 'text-right tabular-nums' },
        cell: ({ row }) => formatCurrency(row.original.fare),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: '',
        meta: { cellClassName: 'w-12' },
        cell: ({ row }) => {
          if (row.original.status !== 'ACTIVE' || !can('TRANSPORT', 'ASSIGN')) {
            return <span className="text-muted-foreground text-sm">—</span>;
          }

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Row actions">
                  <CircleOff className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onClick={() => endTarget.open(row.original)}>
                  <CircleOff className="size-4" aria-hidden />
                  End allocation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [can, endTarget],
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
            searchPlaceholder="Name, admission number or stop…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setRouteFilter(ALL);
              setStatusFilter('ACTIVE');
            }}
            filters={
              <>
                <Select value={routeFilter} onValueChange={setRouteFilter}>
                  <SelectTrigger className="w-[12rem]" aria-label="Filter by route">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All routes</SelectItem>
                    {(routes.data ?? []).map((route) => (
                      <SelectItem key={route.id} value={route.id}>
                        {route.name} · {route.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[10rem]" aria-label="Filter by status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Current</SelectItem>
                    <SelectItem value="VACATED">Ended</SelectItem>
                    <SelectItem value="TRANSFERRED">Transferred</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              can('TRANSPORT', 'EXPORT') && (
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
            icon={Users}
            title={isFiltered ? 'No matching riders' : 'No students are riding yet'}
            description={
              isFiltered
                ? 'Try a different filter or search term.'
                : 'Assign a student to a route and stop from the Routes tab.'
            }
          />
        }
      />

      <ConfirmDialog
        open={endTarget.isOpen}
        onOpenChange={endTarget.onOpenChange}
        title="End this allocation?"
        description={
          <>
            <strong>
              {endTarget.target?.student.user.firstName}{' '}
              {endTarget.target?.student.user.lastName}
            </strong>{' '}
            will stop riding {endTarget.target?.route.name} as of today, freeing a seat.
          </>
        }
        confirmLabel="End allocation"
        variant="destructive"
        onConfirm={async () => {
          if (endTarget.target) {
            await endMutation.mutateAsync(endTarget.target);
          }
        }}
      />
    </>
  );
}
