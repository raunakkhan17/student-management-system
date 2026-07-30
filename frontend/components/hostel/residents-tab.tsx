'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRightLeft, Download, DoorOpen, MoreHorizontal, Users } from 'lucide-react';
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
import { useHostelOptions } from '@/hooks/use-hostel-options';
import { useTableState } from '@/hooks/use-table-state';
import { ApiError } from '@/lib/api-client';
import { downloadBlob } from '@/lib/download';
import { formatCurrency, formatDate } from '@/lib/format';
import { hostelService } from '@/services/hostel.service';
import type { HostelAllocation } from '@/types/hostel';
import { RequestTransferDialog } from './request-transfer-dialog';

const ALL = '__all__';

export function ResidentsTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const table = useTableState({ defaultSortBy: 'allocatedFrom', defaultSortOrder: 'desc' });
  const hostels = useHostelOptions();

  const [hostelFilter, setHostelFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [transferTarget, setTransferTarget] = useState<HostelAllocation | null>(null);
  const vacateTarget = useConfirmTarget<HostelAllocation>();

  const params = {
    ...table.queryParams,
    ...(hostelFilter !== ALL ? { hostelId: hostelFilter } : {}),
    status: statusFilter,
  };

  const query = useQuery({
    queryKey: ['hostel', 'allocations', params],
    queryFn: () => hostelService.listAllocations(params),
  });

  const vacateMutation = useMutation({
    mutationFn: (allocation: HostelAllocation) =>
      hostelService.vacateRoom(allocation.id, {
        allocatedTo: new Date().toISOString().slice(0, 10),
      }),
    onSuccess: async () => {
      toast.success('Bed vacated');
      await queryClient.invalidateQueries({ queryKey: ['hostel'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not vacate the bed');
    },
  });

  const exportMutation = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') =>
      hostelService.exportOccupancy({
        ...(hostelFilter !== ALL ? { hostelId: hostelFilter } : {}),
        format,
      }),
    onSuccess: (blob, format) => {
      downloadBlob(blob, `hostel-occupancy-${new Date().toISOString().slice(0, 10)}.${format}`);
      toast.success('Occupancy report downloaded');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not export the report');
    },
  });

  const isFiltered =
    table.state.search.length > 0 || hostelFilter !== ALL || statusFilter !== 'ACTIVE';

  const columns = useMemo<ColumnDef<HostelAllocation, unknown>[]>(
    () => [
      {
        id: 'student',
        header: 'Resident',
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
        id: 'room',
        header: 'Room',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">
              {row.original.room.roomNumber}
              {row.original.bedNumber ? ` · bed ${row.original.bedNumber}` : ''}
            </p>
            <p className="text-muted-foreground truncate text-sm">
              {row.original.room.hostel.name}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'allocatedFrom',
        header: 'From',
        meta: { sortKey: 'allocatedFrom' },
        cell: ({ row }) => formatDate(row.original.allocatedFrom),
      },
      {
        id: 'allocatedTo',
        header: 'Until',
        meta: { hideOnMobile: true },
        cell: ({ row }) =>
          row.original.allocatedTo ? (
            formatDate(row.original.allocatedTo)
          ) : (
            <span className="text-muted-foreground">Open-ended</span>
          ),
      },
      {
        id: 'rent',
        header: 'Rent',
        meta: { hideOnMobile: true, cellClassName: 'text-right tabular-nums' },
        cell: ({ row }) => formatCurrency(row.original.room.monthlyRent),
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
          if (row.original.status !== 'ACTIVE') {
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
                {can('HOSTEL', 'CREATE') && (
                  <DropdownMenuItem onClick={() => setTransferTarget(row.original)}>
                    <ArrowRightLeft className="size-4" aria-hidden />
                    Request a transfer
                  </DropdownMenuItem>
                )}
                {can('HOSTEL', 'ASSIGN') && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => vacateTarget.open(row.original)}
                  >
                    <DoorOpen className="size-4" aria-hidden />
                    Vacate
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [can, vacateTarget],
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
            searchPlaceholder="Name, admission number or room…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setHostelFilter(ALL);
              setStatusFilter('ACTIVE');
            }}
            filters={
              <>
                <Select value={hostelFilter} onValueChange={setHostelFilter}>
                  <SelectTrigger className="w-[11rem]" aria-label="Filter by hostel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All hostels</SelectItem>
                    {(hostels.data ?? []).map((hostel) => (
                      <SelectItem key={hostel.id} value={hostel.id}>
                        {hostel.name}
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
                    <SelectItem value="VACATED">Vacated</SelectItem>
                    <SelectItem value="TRANSFERRED">Transferred</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              can('HOSTEL', 'EXPORT') && (
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
            title={isFiltered ? 'No matching residents' : 'No one is resident yet'}
            description={
              isFiltered
                ? 'Try a different filter or search term.'
                : 'Allocate a bed from the Rooms tab to admit a resident.'
            }
          />
        }
      />

      <RequestTransferDialog
        allocation={transferTarget}
        onOpenChange={(open) => {
          if (!open) setTransferTarget(null);
        }}
      />

      <ConfirmDialog
        open={vacateTarget.isOpen}
        onOpenChange={vacateTarget.onOpenChange}
        title="Vacate this bed?"
        description={
          <>
            <strong>
              {vacateTarget.target?.student.user.firstName}{' '}
              {vacateTarget.target?.student.user.lastName}
            </strong>{' '}
            will be released from room {vacateTarget.target?.room.roomNumber} as of today, and the
            bed becomes available.
          </>
        }
        confirmLabel="Vacate bed"
        variant="destructive"
        onConfirm={async () => {
          if (vacateTarget.target) {
            await vacateMutation.mutateAsync(vacateTarget.target);
          }
        }}
      />
    </>
  );
}
