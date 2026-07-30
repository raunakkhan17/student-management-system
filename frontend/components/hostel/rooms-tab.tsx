'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { BedDouble, Layers, MoreHorizontal, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { StatusBadge } from '@/components/common/status-badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useCrudMutations } from '@/hooks/use-crud-mutations';
import { useHostelOptions } from '@/hooks/use-hostel-options';
import { useTableState } from '@/hooks/use-table-state';
import { formatCurrency } from '@/lib/format';
import { hostelService } from '@/services/hostel.service';
import {
  ROOM_STATUS_LABELS,
  ROOM_TYPE_LABELS,
  type HostelRoom,
  type HostelRoomType,
} from '@/types/hostel';
import { AllocateRoomDialog } from './allocate-room-dialog';
import { BulkRoomsDialog } from './bulk-rooms-dialog';
import { RoomFormDialog } from './room-form-dialog';

const ALL = '__all__';
const QUERY_KEY = ['hostel', 'rooms'] as const;
const ROOM_TYPES: HostelRoomType[] = ['SINGLE', 'DOUBLE', 'TRIPLE', 'DORMITORY'];

export function RoomsTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'roomNumber', defaultSortOrder: 'asc' });
  const hostels = useHostelOptions();

  const [hostelFilter, setHostelFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [availabilityFilter, setAvailabilityFilter] = useState(ALL);

  const [editing, setEditing] = useState<HostelRoom | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [allocateTarget, setAllocateTarget] = useState<HostelRoom | null>(null);
  const deleteTarget = useConfirmTarget<HostelRoom>();

  const params = {
    ...table.queryParams,
    ...(hostelFilter !== ALL ? { hostelId: hostelFilter } : {}),
    ...(typeFilter !== ALL ? { type: typeFilter as HostelRoomType } : {}),
    ...(availabilityFilter === 'available' ? { onlyAvailable: true } : {}),
  };

  const query = useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () => hostelService.listRooms(params),
  });

  const { deleteMutation } = useCrudMutations<never, never, HostelRoom>({
    queryKey: QUERY_KEY,
    entityName: 'room',
    remove: hostelService.deleteRoom,
  });

  const isFiltered =
    table.state.search.length > 0 ||
    hostelFilter !== ALL ||
    typeFilter !== ALL ||
    availabilityFilter !== ALL;

  const openCreate = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const columns = useMemo<ColumnDef<HostelRoom, unknown>[]>(
    () => [
      {
        accessorKey: 'roomNumber',
        header: 'Room',
        meta: { sortKey: 'roomNumber' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.roomNumber}</p>
            <p className="text-muted-foreground truncate text-sm">
              {row.original.hostel.name}
              {row.original.floor ? ` · ${row.original.floor}` : ''}
            </p>
          </div>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        meta: { hideOnMobile: true },
        cell: ({ row }) => (
          <Badge variant="secondary">{ROOM_TYPE_LABELS[row.original.type]}</Badge>
        ),
      },
      {
        id: 'beds',
        header: 'Beds',
        meta: { cellClassName: 'tabular-nums' },
        cell: ({ row }) => {
          const free = row.original.capacity - row.original.occupied;
          return (
            <span>
              {row.original.occupied} / {row.original.capacity}
              {free > 0 && <span className="text-success ml-2 text-sm">{free} free</span>}
            </span>
          );
        },
      },
      {
        id: 'residents',
        header: 'Residents',
        meta: { hideOnMobile: true },
        cell: ({ row }) => {
          if (row.original.allocations.length === 0) {
            return <span className="text-muted-foreground">Empty</span>;
          }

          return (
            <div className="flex flex-wrap gap-1.5">
              {row.original.allocations.map((allocation) => (
                <Badge key={allocation.id} variant="outline">
                  {allocation.student.user.firstName} {allocation.student.user.lastName}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        accessorKey: 'monthlyRent',
        header: 'Rent',
        meta: { hideOnMobile: true, cellClassName: 'text-right tabular-nums' },
        cell: ({ row }) => formatCurrency(row.original.monthlyRent),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            label={ROOM_STATUS_LABELS[row.original.status]}
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        meta: { cellClassName: 'w-12' },
        cell: ({ row }) => {
          const hasFreeBed = row.original.occupied < row.original.capacity;
          const isOpenForIntake =
            row.original.status !== 'MAINTENANCE' && row.original.status !== 'RESERVED';

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Row actions">
                  <MoreHorizontal className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {can('HOSTEL', 'ASSIGN') && hasFreeBed && isOpenForIntake && (
                  <DropdownMenuItem onClick={() => setAllocateTarget(row.original)}>
                    <UserPlus className="size-4" aria-hidden />
                    Allocate a bed
                  </DropdownMenuItem>
                )}
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
          );
        },
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
            searchPlaceholder="Search room numbers…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setHostelFilter(ALL);
              setTypeFilter(ALL);
              setAvailabilityFilter(ALL);
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

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[9rem]" aria-label="Filter by room type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All types</SelectItem>
                    {ROOM_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {ROOM_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
                  <SelectTrigger className="w-[10rem]" aria-label="Filter by availability">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All rooms</SelectItem>
                    <SelectItem value="available">Has a free bed</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              can('HOSTEL', 'CREATE') && (
                <>
                  <Button variant="outline" onClick={() => setIsBulkOpen(true)}>
                    <Layers className="size-4" aria-hidden />
                    Bulk add
                  </Button>
                  <Button onClick={openCreate}>
                    <Plus className="size-4" aria-hidden />
                    New room
                  </Button>
                </>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={BedDouble}
            title={isFiltered ? 'No matching rooms' : 'No rooms yet'}
            description={
              isFiltered
                ? 'Try a different filter or search term.'
                : 'Add rooms one at a time, or create a whole numbered block at once.'
            }
            action={
              !isFiltered &&
              can('HOSTEL', 'CREATE') && (
                <Button onClick={() => setIsBulkOpen(true)}>
                  <Layers className="size-4" aria-hidden />
                  Bulk add rooms
                </Button>
              )
            }
          />
        }
      />

      <RoomFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        room={editing}
        {...(hostelFilter !== ALL ? { defaultHostelId: hostelFilter } : {})}
      />

      <BulkRoomsDialog
        open={isBulkOpen}
        onOpenChange={setIsBulkOpen}
        {...(hostelFilter !== ALL ? { defaultHostelId: hostelFilter } : {})}
      />

      <AllocateRoomDialog
        room={allocateTarget}
        onOpenChange={(open) => {
          if (!open) setAllocateTarget(null);
        }}
      />

      <ConfirmDialog
        open={deleteTarget.isOpen}
        onOpenChange={deleteTarget.onOpenChange}
        title="Remove this room?"
        description={
          <>
            Room <strong>{deleteTarget.target?.roomNumber}</strong> will be removed. This is only
            possible while it is empty.
          </>
        }
        confirmLabel="Remove room"
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
