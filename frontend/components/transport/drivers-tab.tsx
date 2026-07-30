'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { IdCard, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useCrudMutations } from '@/hooks/use-crud-mutations';
import { useTableState } from '@/hooks/use-table-state';
import { applyApiErrors } from '@/lib/form-errors';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { transportService } from '@/services/transport.service';
import {
  DRIVER_STATUS_LABELS,
  type Driver,
  type DriverPayload,
  type DriverStatus,
} from '@/types/transport';

const ALL = '__all__';
const FORM_ID = 'driver-form';
const QUERY_KEY = ['transport', 'drivers'] as const;
const STATUSES: DriverStatus[] = ['ACTIVE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED'];
const EXPIRY_WARNING_DAYS = 30;

const driverFormSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and dashes only'),
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  phone: z.string().trim().min(7, 'Enter a valid phone number').max(20),
  alternatePhone: z.string().trim().max(20).optional(),
  licenseNumber: z.string().trim().min(1, 'License number is required').max(40),
  licenseExpiry: z.string().min(1, 'Choose the licence expiry date'),
  address: z.string().trim().max(300).optional(),
  experienceYears: z.coerce.number().int().min(0).max(60),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED']),
});

type DriverFormValues = z.infer<typeof driverFormSchema>;

const EMPTY: DriverFormValues = {
  employeeCode: '',
  firstName: '',
  lastName: '',
  phone: '',
  alternatePhone: '',
  licenseNumber: '',
  licenseExpiry: '',
  address: '',
  experienceYears: 0,
  status: 'ACTIVE',
};

export function DriversTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'firstName', defaultSortOrder: 'asc' });

  const [statusFilter, setStatusFilter] = useState(ALL);
  const [expiryFilter, setExpiryFilter] = useState(ALL);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<Driver>();

  const params = {
    ...table.queryParams,
    ...(statusFilter !== ALL ? { status: statusFilter as DriverStatus } : {}),
    ...(expiryFilter === 'soon' ? { expiringSoon: true } : {}),
  };

  const query = useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () => transportService.listDrivers(params),
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    DriverPayload,
    Partial<DriverPayload>,
    Driver
  >({
    queryKey: QUERY_KEY,
    entityName: 'driver',
    create: transportService.createDriver,
    update: transportService.updateDriver,
    remove: transportService.deleteDriver,
    onSuccess: () => setIsFormOpen(false),
  });

  const form = useForm<DriverFormValues>({
    resolver: zodResolver(driverFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            employeeCode: editing.employeeCode,
            firstName: editing.firstName,
            lastName: editing.lastName,
            phone: editing.phone,
            alternatePhone: editing.alternatePhone ?? '',
            licenseNumber: editing.licenseNumber,
            licenseExpiry: editing.licenseExpiry.slice(0, 10),
            address: editing.address ?? '',
            experienceYears: editing.experienceYears,
            status: editing.status,
          }
        : EMPTY,
    );
  }, [isFormOpen, editing, form]);

  const onSubmit = async (values: DriverFormValues) => {
    const payload: DriverPayload = {
      employeeCode: values.employeeCode.toUpperCase(),
      firstName: values.firstName,
      lastName: values.lastName,
      phone: values.phone,
      licenseNumber: values.licenseNumber,
      licenseExpiry: values.licenseExpiry,
      experienceYears: values.experienceYears,
      status: values.status,
      ...(values.alternatePhone ? { alternatePhone: values.alternatePhone } : {}),
      ...(values.address ? { address: values.address } : {}),
    };

    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'employeeCode',
        'firstName',
        'lastName',
        'phone',
        'alternatePhone',
        'licenseNumber',
        'licenseExpiry',
        'address',
        'experienceYears',
        'status',
      ]);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const isFiltered = table.state.search.length > 0 || statusFilter !== ALL || expiryFilter !== ALL;

  const columns = useMemo<ColumnDef<Driver, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Driver',
        meta: { sortKey: 'firstName' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">
              {row.original.firstName} {row.original.lastName}
            </p>
            <p className="text-muted-foreground truncate text-sm">
              {row.original.employeeCode} · {row.original.phone}
            </p>
          </div>
        ),
      },
      {
        id: 'licence',
        header: 'Licence',
        cell: ({ row }) => {
          const expiry = new Date(row.original.licenseExpiry).getTime();
          const isLapsed = expiry < Date.now();
          const isSoon = !isLapsed && expiry < Date.now() + EXPIRY_WARNING_DAYS * 86_400_000;

          return (
            <div className="min-w-0">
              <p className="truncate">{row.original.licenseNumber}</p>
              <p
                className={cn(
                  'truncate text-sm',
                  isLapsed && 'text-destructive font-medium',
                  isSoon && 'text-warning font-medium',
                  !isLapsed && !isSoon && 'text-muted-foreground',
                )}
              >
                {isLapsed ? 'Expired ' : 'Valid until '}
                {formatDate(row.original.licenseExpiry)}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: 'experienceYears',
        header: 'Experience',
        meta: { hideOnMobile: true, cellClassName: 'tabular-nums' },
        cell: ({ row }) => `${row.original.experienceYears} yr`,
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
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            label={DRIVER_STATUS_LABELS[row.original.status]}
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
            searchPlaceholder="Name, code or licence…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setStatusFilter(ALL);
              setExpiryFilter(ALL);
            }}
            filters={
              <>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[10rem]" aria-label="Filter by status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {DRIVER_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={expiryFilter} onValueChange={setExpiryFilter}>
                  <SelectTrigger className="w-[13rem]" aria-label="Filter by licence expiry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any licence</SelectItem>
                    <SelectItem value="soon">Expiring within 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              can('TRANSPORT', 'CREATE') && (
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  Add driver
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={IdCard}
            title={isFiltered ? 'No matching drivers' : 'No drivers yet'}
            description={
              isFiltered
                ? 'Try a different filter or search term.'
                : 'Add drivers so they can be assigned to routes.'
            }
            action={
              !isFiltered &&
              can('TRANSPORT', 'CREATE') && (
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  Add driver
                </Button>
              )
            }
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit driver' : 'Add driver'}
        description="A driver with a lapsed licence cannot be recorded as active."
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Add driver'}
        size="lg"
      >
        <Form {...form}>
          <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First name</FormLabel>
                    <FormControl>
                      <Input {...field} autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="employeeCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee code</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="DRV-01"
                        className="uppercase"
                        onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {DRIVER_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="+91 98765 43210" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="alternatePhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alternate phone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="licenseNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Licence number</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="licenseExpiry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Licence expires</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="experienceYears"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Experience (years)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={0} max={60} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="Optional" />
                  </FormControl>
                  <FormDescription>Used for emergency contact records.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>

      <ConfirmDialog
        open={deleteTarget.isOpen}
        onOpenChange={deleteTarget.onOpenChange}
        title="Remove this driver?"
        description={
          <>
            <strong>
              {deleteTarget.target?.firstName} {deleteTarget.target?.lastName}
            </strong>{' '}
            will be removed. This is only possible while they are not assigned to a route.
          </>
        }
        confirmLabel="Remove driver"
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
