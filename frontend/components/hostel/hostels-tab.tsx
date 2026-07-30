'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Building2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/use-auth';
import { useCrudMutations } from '@/hooks/use-crud-mutations';
import { useTableState } from '@/hooks/use-table-state';
import { hostelService } from '@/services/hostel.service';
import { HOSTEL_TYPE_LABELS, type Hostel } from '@/types/hostel';
import { HostelFormDialog } from './hostel-form-dialog';

const QUERY_KEY = ['hostel', 'list'] as const;

export function HostelsTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'name', defaultSortOrder: 'asc' });
  const [editing, setEditing] = useState<Hostel | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<Hostel>();

  const query = useQuery({
    queryKey: [...QUERY_KEY, table.queryParams],
    queryFn: () => hostelService.list(table.queryParams),
  });

  const { deleteMutation } = useCrudMutations<never, never, Hostel>({
    queryKey: QUERY_KEY,
    entityName: 'hostel',
    remove: hostelService.remove,
  });

  const openCreate = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const columns = useMemo<ColumnDef<Hostel, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Hostel',
        meta: { sortKey: 'name' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="text-muted-foreground truncate text-sm">{row.original.code}</p>
          </div>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <Badge variant="secondary">{HOSTEL_TYPE_LABELS[row.original.type]}</Badge>
        ),
      },
      {
        id: 'warden',
        header: 'Warden',
        meta: { hideOnMobile: true },
        cell: ({ row }) => {
          const { warden } = row.original;
          return warden ? (
            <span>
              {warden.user.firstName} {warden.user.lastName}
            </span>
          ) : (
            <span className="text-muted-foreground">Not assigned</span>
          );
        },
      },
      {
        id: 'occupancy',
        header: 'Occupancy',
        cell: ({ row }) => {
          const { occupied, capacity, occupancyPercent } = row.original;

          return (
            <div className="min-w-[8rem] space-y-1.5">
              <p className="text-sm tabular-nums">
                {occupied} / {capacity} beds
              </p>
              <Progress value={occupancyPercent ?? 0} className="h-1.5" />
            </div>
          );
        },
      },
      {
        id: 'rooms',
        header: 'Rooms',
        meta: { hideOnMobile: true, cellClassName: 'tabular-nums' },
        cell: ({ row }) => row.original._count.rooms,
      },
      {
        id: 'actions',
        header: '',
        meta: { cellClassName: 'w-12' },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Row actions">
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {can('HOSTEL', 'EDIT') && (
                <DropdownMenuItem
                  onClick={() => {
                    setEditing(row.original);
                    setIsFormOpen(true);
                  }}
                >
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </DropdownMenuItem>
              )}
              {can('HOSTEL', 'DELETE') && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => deleteTarget.open(row.original)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Remove
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [can, deleteTarget],
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
            searchPlaceholder="Search hostels…"
            isFiltered={table.state.search.length > 0}
            onReset={table.reset}
            actions={
              can('HOSTEL', 'CREATE') && (
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  New hostel
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={Building2}
            title={table.state.search ? 'No matching hostels' : 'No hostels yet'}
            description={
              table.state.search
                ? 'Try a different search term.'
                : 'Register a hostel block, then add its rooms and allocate beds.'
            }
            action={
              !table.state.search &&
              can('HOSTEL', 'CREATE') && (
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  New hostel
                </Button>
              )
            }
          />
        }
      />

      <HostelFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} hostel={editing} />

      <ConfirmDialog
        open={deleteTarget.isOpen}
        onOpenChange={deleteTarget.onOpenChange}
        title="Remove this hostel?"
        description={
          <>
            <strong>{deleteTarget.target?.name}</strong> and its rooms will be removed. This is only
            possible while no room is occupied.
          </>
        }
        confirmLabel="Remove hostel"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget.target) {
            await deleteMutation.mutateAsync(deleteTarget.target.id);
          }
        }}
      />
    </>
  );
}
