'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Bus, MoreHorizontal, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
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
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { transportService } from '@/services/transport.service';
import {
  VEHICLE_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  type Vehicle,
  type VehicleStatus,
  type VehicleType,
} from '@/types/transport';
import { MaintenanceFormDialog } from './maintenance-form-dialog';
import { VehicleFormDialog } from './vehicle-form-dialog';

const ALL = '__all__';
const QUERY_KEY = ['transport', 'vehicles'] as const;
const TYPES: VehicleType[] = ['BUS', 'MINI_BUS', 'VAN', 'CAR'];
const STATUSES: VehicleStatus[] = ['ACTIVE', 'MAINTENANCE', 'INACTIVE', 'RETIRED'];

/** Documents lapsing within this window are highlighted, matching the API. */
const EXPIRY_WARNING_DAYS = 30;

function expiryTone(value: string | null): 'ok' | 'soon' | 'lapsed' {
  if (!value) return 'ok';
  const time = new Date(value).getTime();
  if (time < Date.now()) return 'lapsed';
  if (time < Date.now() + EXPIRY_WARNING_DAYS * 86_400_000) return 'soon';
  return 'ok';
}

export function VehiclesTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'registrationNumber', defaultSortOrder: 'asc' });

  const [statusFilter, setStatusFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [expiryFilter, setExpiryFilter] = useState(ALL);

  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [maintenanceTarget, setMaintenanceTarget] = useState<Vehicle | null>(null);
  const deleteTarget = useConfirmTarget<Vehicle>();

  const params = {
    ...table.queryParams,
    ...(statusFilter !== ALL ? { status: statusFilter as VehicleStatus } : {}),
    ...(typeFilter !== ALL ? { type: typeFilter as VehicleType } : {}),
    ...(expiryFilter === 'soon' ? { expiringSoon: true } : {}),
  };

  const query = useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () => transportService.listVehicles(params),
  });

  const { deleteMutation } = useCrudMutations<never, never, Vehicle>({
    queryKey: QUERY_KEY,
    entityName: 'vehicle',
    remove: transportService.deleteVehicle,
  });

  const isFiltered =
    table.state.search.length > 0 ||
    statusFilter !== ALL ||
    typeFilter !== ALL ||
    expiryFilter !== ALL;

  const openCreate = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const columns = useMemo<ColumnDef<Vehicle, unknown>[]>(
    () => [
      {
        accessorKey: 'registrationNumber',
        header: 'Vehicle',
        meta: { sortKey: 'registrationNumber' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.registrationNumber}</p>
            <p className="text-muted-foreground truncate text-sm">
              {row.original.make} {row.original.model}
              {row.original.manufactureYear ? ` · ${row.original.manufactureYear}` : ''}
            </p>
          </div>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        meta: { hideOnMobile: true },
        cell: ({ row }) => (
          <Badge variant="secondary">{VEHICLE_TYPE_LABELS[row.original.type]}</Badge>
        ),
      },
      {
        accessorKey: 'capacity',
        header: 'Seats',
        meta: { sortKey: 'capacity', cellClassName: 'tabular-nums' },
      },
      {
        id: 'routes',
        header: 'Route',
        meta: { hideOnMobile: true },
        cell: ({ row }) =>
          row.original.routes.length === 0 ? (
            <span className="text-muted-foreground">Unassigned</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {row.original.routes.map((route) => (
                <Badge key={route.id} variant="outline">
                  {route.code}
                </Badge>
              ))}
            </div>
          ),
      },
      {
        id: 'documents',
        header: 'Documents',
        meta: { hideOnMobile: true },
        cell: ({ row }) => {
          const entries: { label: string; value: string | null }[] = [
            { label: 'Ins', value: row.original.insuranceExpiry },
            { label: 'Fit', value: row.original.fitnessExpiry },
            { label: 'PUC', value: row.original.pollutionExpiry },
          ];

          return (
            <div className="space-y-0.5 text-sm">
              {entries.map((entry) => {
                const tone = expiryTone(entry.value);
                return (
                  <p
                    key={entry.label}
                    className={cn(
                      'tabular-nums',
                      tone === 'lapsed' && 'text-destructive font-medium',
                      tone === 'soon' && 'text-warning font-medium',
                      tone === 'ok' && 'text-muted-foreground',
                    )}
                  >
                    {entry.label} {entry.value ? formatDate(entry.value) : '—'}
                  </p>
                );
              })}
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            label={VEHICLE_STATUS_LABELS[row.original.status]}
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
              <Button variant="ghost" size="icon" className="size-8" aria-label="Row actions">
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {can('TRANSPORT', 'CREATE') && (
                <DropdownMenuItem onClick={() => setMaintenanceTarget(row.original)}>
                  <Wrench className="size-4" aria-hidden />
                  Log maintenance
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
                  Edit
                </DropdownMenuItem>
              )}
              {can('TRANSPORT', 'DELETE') && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => deleteTarget.open(row.original)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Retire
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
            searchPlaceholder="Registration, make or model…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setStatusFilter(ALL);
              setTypeFilter(ALL);
              setExpiryFilter(ALL);
            }}
            filters={
              <>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[11rem]" aria-label="Filter by status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {VEHICLE_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[9rem]" aria-label="Filter by type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All types</SelectItem>
                    {TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {VEHICLE_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={expiryFilter} onValueChange={setExpiryFilter}>
                  <SelectTrigger className="w-[12rem]" aria-label="Filter by document expiry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any documents</SelectItem>
                    <SelectItem value="soon">Expiring within 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              can('TRANSPORT', 'CREATE') && (
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  Register vehicle
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={Bus}
            title={isFiltered ? 'No matching vehicles' : 'No vehicles yet'}
            description={
              isFiltered
                ? 'Try a different filter or search term.'
                : 'Register the fleet, then build routes and assign a vehicle to each.'
            }
            action={
              !isFiltered &&
              can('TRANSPORT', 'CREATE') && (
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  Register vehicle
                </Button>
              )
            }
          />
        }
      />

      <VehicleFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} vehicle={editing} />

      <MaintenanceFormDialog
        vehicle={maintenanceTarget}
        onOpenChange={(open) => {
          if (!open) setMaintenanceTarget(null);
        }}
      />

      <ConfirmDialog
        open={deleteTarget.isOpen}
        onOpenChange={deleteTarget.onOpenChange}
        title="Retire this vehicle?"
        description={
          <>
            <strong>{deleteTarget.target?.registrationNumber}</strong> will be retired from the
            fleet. This is only possible while it is not assigned to a route.
          </>
        }
        confirmLabel="Retire vehicle"
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
