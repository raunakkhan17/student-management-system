'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useTableState } from '@/hooks/use-table-state';
import { formatCurrency, formatDate } from '@/lib/format';
import { transportService } from '@/services/transport.service';
import {
  MAINTENANCE_TYPE_LABELS,
  type MaintenanceLog,
  type MaintenanceType,
} from '@/types/transport';
import { MaintenanceFormDialog } from './maintenance-form-dialog';

const ALL = '__all__';
const TYPES: MaintenanceType[] = [
  'ROUTINE_SERVICE',
  'REPAIR',
  'TYRE_CHANGE',
  'INSURANCE_RENEWAL',
  'FITNESS_RENEWAL',
  'POLLUTION_CHECK',
  'OTHER',
];

export function MaintenanceTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'serviceDate', defaultSortOrder: 'desc' });

  const [vehicleFilter, setVehicleFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const vehicles = useQuery({
    queryKey: ['transport', 'vehicles', 'options'],
    queryFn: () => transportService.listVehicleOptions(),
  });

  const params = {
    ...table.queryParams,
    ...(vehicleFilter !== ALL ? { vehicleId: vehicleFilter } : {}),
    ...(typeFilter !== ALL ? { type: typeFilter as MaintenanceType } : {}),
  };

  const query = useQuery({
    queryKey: ['transport', 'maintenance', params],
    queryFn: () => transportService.listMaintenance(params),
  });

  const isFiltered = table.state.search.length > 0 || vehicleFilter !== ALL || typeFilter !== ALL;

  const columns = useMemo<ColumnDef<MaintenanceLog, unknown>[]>(
    () => [
      {
        id: 'vehicle',
        header: 'Vehicle',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.vehicle.registrationNumber}</p>
            <p className="text-muted-foreground truncate text-sm">
              {row.original.vehicle.make} {row.original.vehicle.model}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <Badge variant="secondary">{MAINTENANCE_TYPE_LABELS[row.original.type]}</Badge>
        ),
      },
      {
        accessorKey: 'description',
        header: 'Work done',
        cell: ({ row }) => (
          <p className="max-w-[20rem] truncate text-sm">{row.original.description}</p>
        ),
      },
      {
        accessorKey: 'serviceDate',
        header: 'Serviced',
        meta: { sortKey: 'serviceDate' },
        cell: ({ row }) => formatDate(row.original.serviceDate),
      },
      {
        id: 'nextServiceDate',
        header: 'Next due',
        meta: { hideOnMobile: true },
        cell: ({ row }) =>
          row.original.nextServiceDate ? (
            formatDate(row.original.nextServiceDate)
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: 'cost',
        header: 'Cost',
        meta: { sortKey: 'cost', cellClassName: 'text-right tabular-nums' },
        cell: ({ row }) => formatCurrency(row.original.cost),
      },
      {
        id: 'vendor',
        header: 'Vendor',
        meta: { hideOnMobile: true },
        cell: ({ row }) =>
          row.original.vendor ?? <span className="text-muted-foreground">—</span>,
      },
    ],
    [],
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
            searchPlaceholder="Registration, vendor or work…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setVehicleFilter(ALL);
              setTypeFilter(ALL);
            }}
            filters={
              <>
                <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                  <SelectTrigger className="w-[12rem]" aria-label="Filter by vehicle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All vehicles</SelectItem>
                    {(vehicles.data ?? []).map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.registrationNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[12rem]" aria-label="Filter by type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All types</SelectItem>
                    {TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {MAINTENANCE_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              can('TRANSPORT', 'CREATE') && (
                <Button onClick={() => setIsFormOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  Log maintenance
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={Wrench}
            title={isFiltered ? 'No matching records' : 'No maintenance logged'}
            description={
              isFiltered
                ? 'Try a different filter or search term.'
                : 'Log servicing, repairs and statutory renewals to keep the fleet compliant.'
            }
            action={
              can('TRANSPORT', 'CREATE') && (
                <Button onClick={() => setIsFormOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  Log maintenance
                </Button>
              )
            }
          />
        }
      />

      <MaintenanceFormDialog open={isFormOpen} vehicle={null} onOpenChange={setIsFormOpen} />
    </>
  );
}
