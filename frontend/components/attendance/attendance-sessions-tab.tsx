'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardList, Lock, LockOpen, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
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
import { formatDate, formatDateTime } from '@/lib/format';
import { attendanceService } from '@/services/attendance.service';
import type { AttendanceSessionListItem, AttendanceSessionStatus } from '@/types/attendance';

const ALL = '__all__';
const STATUSES: AttendanceSessionStatus[] = ['DRAFT', 'SUBMITTED', 'LOCKED'];

export function AttendanceSessionsTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const table = useTableState({ defaultSortBy: 'date', defaultSortOrder: 'desc' });
  const [statusFilter, setStatusFilter] = useState(ALL);

  const lockTarget = useConfirmTarget<AttendanceSessionListItem>();
  const unlockTarget = useConfirmTarget<AttendanceSessionListItem>();

  const params = {
    ...table.queryParams,
    ...(statusFilter !== ALL ? { status: statusFilter as AttendanceSessionStatus } : {}),
  };

  const query = useQuery({
    queryKey: ['attendance', 'sessions', params],
    queryFn: () => attendanceService.listSessions(params),
  });

  const lockMutation = useMutation({
    mutationFn: (id: string) => attendanceService.lockSession(id),
    onSuccess: async () => {
      toast.success('Roll locked');
      await queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not lock the roll');
    },
  });

  const unlockMutation = useMutation({
    mutationFn: (id: string) => attendanceService.unlockSession(id),
    onSuccess: async () => {
      toast.success('Roll reopened');
      await queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not reopen the roll');
    },
  });

  const columns: ColumnDef<AttendanceSessionListItem, unknown>[] = [
    {
      accessorKey: 'date',
      header: 'Date',
      meta: { sortKey: 'date' },
      cell: ({ row }) => formatDate(row.original.date),
    },
    {
      id: 'target',
      header: 'Class',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">
            {row.original.class.name} — {row.original.section.name}
          </p>
          <p className="text-muted-foreground truncate text-sm">
            {row.original.subject ? row.original.subject.name : 'Whole day'}
          </p>
        </div>
      ),
    },
    {
      id: 'markedBy',
      header: 'Marked by',
      meta: { hideOnMobile: true },
      cell: ({ row }) =>
        `${row.original.markedBy.firstName} ${row.original.markedBy.lastName}`,
    },
    {
      id: 'count',
      header: 'Students',
      meta: { hideOnMobile: true, cellClassName: 'tabular-nums' },
      cell: ({ row }) => row.original._count.records,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'submittedAt',
      header: 'Submitted',
      meta: { hideOnMobile: true },
      cell: ({ row }) => formatDateTime(row.original.submittedAt),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'w-12' },
      cell: ({ row }) => {
        if (!can('ATTENDANCE', 'APPROVE')) return null;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Row actions">
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {row.original.status === 'LOCKED' ? (
                <DropdownMenuItem onClick={() => unlockTarget.open(row.original)}>
                  <LockOpen className="size-4" aria-hidden />
                  Reopen roll
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => lockTarget.open(row.original)}>
                  <Lock className="size-4" aria-hidden />
                  Lock roll
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Submitted rolls"
        description="Every attendance session, with the option to lock a roll against further edits."
      />

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
            searchPlaceholder="Search rolls…"
            isFiltered={table.state.search.length > 0 || statusFilter !== ALL}
            onReset={() => {
              table.reset();
              setStatusFilter(ALL);
            }}
            filters={
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[9.5rem]" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0) + status.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        }
        emptyState={
          <EmptyState
            icon={ClipboardList}
            title="No attendance rolls yet"
            description="Rolls appear here once teachers begin marking attendance."
          />
        }
      />

      <ConfirmDialog
        open={lockTarget.isOpen}
        onOpenChange={lockTarget.onOpenChange}
        title="Lock this roll?"
        description="Teachers will no longer be able to change it. Administrators can still reopen it later."
        confirmLabel="Lock roll"
        onConfirm={async () => {
          if (lockTarget.target) await lockMutation.mutateAsync(lockTarget.target.id);
        }}
      />

      <ConfirmDialog
        open={unlockTarget.isOpen}
        onOpenChange={unlockTarget.onOpenChange}
        title="Reopen this roll?"
        description="The teacher who marked it will be able to make corrections again."
        confirmLabel="Reopen roll"
        onConfirm={async () => {
          if (unlockTarget.target) await unlockMutation.mutateAsync(unlockTarget.target.id);
        }}
      />
    </div>
  );
}
