'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { MapPin, MoreHorizontal, Pencil, Plus, Route as RouteIcon, Trash2, UserPlus } from 'lucide-react';
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
import { useTableState } from '@/hooks/use-table-state';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { transportService } from '@/services/transport.service';
import type { TransportRoute } from '@/types/transport';
import { AllocateTransportDialog } from './allocate-transport-dialog';
import { RouteFormDialog } from './route-form-dialog';
import { RouteStopsDialog } from './route-stops-dialog';

const ALL = '__all__';
const QUERY_KEY = ['transport', 'routes'] as const;

export function RoutesTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'name', defaultSortOrder: 'asc' });

  const [activeFilter, setActiveFilter] = useState(ALL);
  const [editing, setEditing] = useState<TransportRoute | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [stopsTarget, setStopsTarget] = useState<TransportRoute | null>(null);
  const [allocateTarget, setAllocateTarget] = useState<TransportRoute | null>(null);
  const deleteTarget = useConfirmTarget<TransportRoute>();

  const params = {
    ...table.queryParams,
    ...(activeFilter === 'active' ? { isActive: true } : {}),
    ...(activeFilter === 'inactive' ? { isActive: false } : {}),
  };

  const query = useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () => transportService.listRoutes(params),
  });

  const { deleteMutation } = useCrudMutations<never, never, TransportRoute>({
    queryKey: QUERY_KEY,
    entityName: 'route',
    remove: transportService.deleteRoute,
  });

  const isFiltered = table.state.search.length > 0 || activeFilter !== ALL;

  const openCreate = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const columns = useMemo<ColumnDef<TransportRoute, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Route',
        meta: { sortKey: 'name' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">
              {row.original.name}
              <span className="text-muted-foreground ml-2 text-sm">{row.original.code}</span>
            </p>
            <p className="text-muted-foreground truncate text-sm">
              {row.original.startPoint} → {row.original.endPoint}
              {row.original.distanceKm ? ` · ${row.original.distanceKm} km` : ''}
            </p>
          </div>
        ),
      },
      {
        id: 'crew',
        header: 'Vehicle & driver',
        cell: ({ row }) => (
          <div className="min-w-0 text-sm">
            <p className="truncate">
              {row.original.vehicle ? (
                row.original.vehicle.registrationNumber
              ) : (
                <span className="text-warning font-medium">No vehicle</span>
              )}
            </p>
            <p className="text-muted-foreground truncate">
              {row.original.driver
                ? `${row.original.driver.firstName} ${row.original.driver.lastName}`
                : 'No driver'}
            </p>
          </div>
        ),
      },
      {
        id: 'stops',
        header: 'Stops',
        meta: { hideOnMobile: true },
        cell: ({ row }) =>
          row.original.stops.length === 0 ? (
            <span className="text-warning text-sm font-medium">None set</span>
          ) : (
            <Badge variant="secondary">{row.original.stops.length} stops</Badge>
          ),
      },
      {
        id: 'riders',
        header: 'Riders',
        meta: { cellClassName: 'tabular-nums' },
        cell: ({ row }) => {
          const capacity = row.original.vehicle?.capacity ?? 0;
          const riders = row.original._count.allocations;
          const isFull = capacity > 0 && riders >= capacity;

          return (
            <span className={cn(isFull && 'text-destructive font-medium')}>
              {riders}
              {capacity > 0 ? ` / ${capacity}` : ''}
            </span>
          );
        },
      },
      {
        accessorKey: 'fare',
        header: 'Fare',
        meta: { sortKey: 'fare', hideOnMobile: true, cellClassName: 'text-right tabular-nums' },
        cell: ({ row }) => formatCurrency(row.original.fare),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.isActive ? 'ACTIVE' : 'INACTIVE'}
            label={row.original.isActive ? 'Running' : 'Suspended'}
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
              {can('TRANSPORT', 'EDIT') && (
                <DropdownMenuItem onClick={() => setStopsTarget(row.original)}>
                  <MapPin className="size-4" aria-hidden />
                  Edit stops
                </DropdownMenuItem>
              )}

              {can('TRANSPORT', 'ASSIGN') &&
                row.original.isActive &&
                row.original.stops.length > 0 && (
                  <DropdownMenuItem onClick={() => setAllocateTarget(row.original)}>
                    <UserPlus className="size-4" aria-hidden />
                    Assign a student
                  </DropdownMenuItem>
                )}

              {can('TRANSPORT', 'EDIT') && (
                <DropdownMenuItem
                  onClick={() => {
                    setEditing(row.original);
                    setIsFormOpen(true);
                  }}
                >
                  <Pencil className="size-4" aria-hidden />
                  Edit route
                </DropdownMenuItem>
              )}

              {can('TRANSPORT', 'DELETE') && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => deleteTarget.open(row.original)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Withdraw
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
        onRowClick={(row) => setStopsTarget(row)}
        toolbar={
          <DataTableToolbar
            search={table.state.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Route name, code or stop…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setActiveFilter(ALL);
            }}
            filters={
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger className="w-[11rem]" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All routes</SelectItem>
                  <SelectItem value="active">Running</SelectItem>
                  <SelectItem value="inactive">Suspended</SelectItem>
                </SelectContent>
              </Select>
            }
            actions={
              can('TRANSPORT', 'CREATE') && (
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  New route
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={RouteIcon}
            title={isFiltered ? 'No matching routes' : 'No routes yet'}
            description={
              isFiltered
                ? 'Try a different filter or search term.'
                : 'Create a route, set its stops, then assign students to a stop.'
            }
            action={
              !isFiltered &&
              can('TRANSPORT', 'CREATE') && (
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  New route
                </Button>
              )
            }
          />
        }
      />

      <RouteFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} route={editing} />

      <RouteStopsDialog
        route={stopsTarget}
        onOpenChange={(open) => {
          if (!open) setStopsTarget(null);
        }}
      />

      <AllocateTransportDialog
        route={allocateTarget}
        onOpenChange={(open) => {
          if (!open) setAllocateTarget(null);
        }}
      />

      <ConfirmDialog
        open={deleteTarget.isOpen}
        onOpenChange={deleteTarget.onOpenChange}
        title="Withdraw this route?"
        description={
          <>
            <strong>{deleteTarget.target?.name}</strong> will be withdrawn. This is only possible
            while no student is still riding it.
          </>
        }
        confirmLabel="Withdraw route"
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
