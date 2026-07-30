'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { LogOut, Plus, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
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
import { useHostelOptions } from '@/hooks/use-hostel-options';
import { useTableState } from '@/hooks/use-table-state';
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import { formatDateTime } from '@/lib/format';
import { hostelService } from '@/services/hostel.service';
import type { HostelVisitor } from '@/types/hostel';

const ALL = '__all__';
const FORM_ID = 'hostel-visitor-form';

const visitorFormSchema = z.object({
  hostelId: z.string().uuid('Select a hostel'),
  studentId: z.string().uuid('Select the resident being visited'),
  visitorName: z.string().trim().min(1, 'Visitor name is required').max(160),
  relation: z.string().trim().min(1, 'Relationship is required').max(60),
  phone: z.string().trim().min(7, 'Enter a valid phone number').max(20),
  idProofType: z.string().trim().max(60).optional(),
  idProofNumber: z.string().trim().max(60).optional(),
  purpose: z.string().trim().max(300).optional(),
});

type VisitorFormValues = z.infer<typeof visitorFormSchema>;

export function VisitorsTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const table = useTableState({ defaultSortBy: 'checkInAt', defaultSortOrder: 'desc' });
  const hostels = useHostelOptions();

  const [hostelFilter, setHostelFilter] = useState(ALL);
  const [presenceFilter, setPresenceFilter] = useState('inside');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const checkOutTarget = useConfirmTarget<HostelVisitor>();

  const params = {
    ...table.queryParams,
    ...(hostelFilter !== ALL ? { hostelId: hostelFilter } : {}),
    ...(presenceFilter === 'inside' ? { onlyInside: true } : {}),
  };

  const query = useQuery({
    queryKey: ['hostel', 'visitors', params],
    queryFn: () => hostelService.listVisitors(params),
  });

  const form = useForm<VisitorFormValues>({
    resolver: zodResolver(visitorFormSchema),
    defaultValues: {
      hostelId: '',
      studentId: '',
      visitorName: '',
      relation: '',
      phone: '',
      idProofType: '',
      idProofNumber: '',
      purpose: '',
    },
  });

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset({
      hostelId: hostelFilter !== ALL ? hostelFilter : '',
      studentId: '',
      visitorName: '',
      relation: '',
      phone: '',
      idProofType: '',
      idProofNumber: '',
      purpose: '',
    });
  }, [isFormOpen, hostelFilter, form]);

  const logMutation = useMutation({
    mutationFn: (values: VisitorFormValues) =>
      hostelService.logVisitor({
        hostelId: values.hostelId,
        studentId: values.studentId,
        visitorName: values.visitorName,
        relation: values.relation,
        phone: values.phone,
        checkInAt: new Date().toISOString(),
        ...(values.idProofType ? { idProofType: values.idProofType } : {}),
        ...(values.idProofNumber ? { idProofNumber: values.idProofNumber } : {}),
        ...(values.purpose ? { purpose: values.purpose } : {}),
      }),
    onSuccess: async (visitor) => {
      toast.success(`${visitor.visitorName} checked in`);
      await queryClient.invalidateQueries({ queryKey: ['hostel'] });
      setIsFormOpen(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not log the visitor');
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: (visitor: HostelVisitor) =>
      hostelService.checkOutVisitor(visitor.id, new Date().toISOString()),
    onSuccess: async () => {
      toast.success('Visitor checked out');
      await queryClient.invalidateQueries({ queryKey: ['hostel'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not check the visitor out');
    },
  });

  const onSubmit = async (values: VisitorFormValues) => {
    try {
      await logMutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'hostelId',
        'studentId',
        'visitorName',
        'relation',
        'phone',
        'idProofType',
        'idProofNumber',
        'purpose',
      ]);
    }
  };

  const isFiltered =
    table.state.search.length > 0 || hostelFilter !== ALL || presenceFilter !== 'inside';

  const columns = useMemo<ColumnDef<HostelVisitor, unknown>[]>(
    () => [
      {
        accessorKey: 'visitorName',
        header: 'Visitor',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.visitorName}</p>
            <p className="text-muted-foreground truncate text-sm">
              {row.original.relation} · {row.original.phone}
            </p>
          </div>
        ),
      },
      {
        id: 'student',
        header: 'Visiting',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">
              {row.original.student.user.firstName} {row.original.student.user.lastName}
            </p>
            <p className="text-muted-foreground truncate text-sm">
              {row.original.hostel.name} · {row.original.student.admissionNumber}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'checkInAt',
        header: 'Checked in',
        meta: { sortKey: 'checkInAt' },
        cell: ({ row }) => formatDateTime(row.original.checkInAt),
      },
      {
        id: 'checkOutAt',
        header: 'Checked out',
        meta: { hideOnMobile: true },
        cell: ({ row }) =>
          row.original.checkOutAt ? (
            formatDateTime(row.original.checkOutAt)
          ) : (
            <StatusBadge status="ACTIVE" label="On premises" />
          ),
      },
      {
        id: 'idProof',
        header: 'ID proof',
        meta: { hideOnMobile: true },
        cell: ({ row }) => {
          const { idProofType, idProofNumber } = row.original;
          if (!idProofType && !idProofNumber) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <span className="text-sm">{[idProofType, idProofNumber].filter(Boolean).join(' · ')}</span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        meta: { cellClassName: 'w-28' },
        cell: ({ row }) => {
          if (row.original.checkOutAt || !can('HOSTEL', 'EDIT')) {
            return <span className="text-muted-foreground text-sm">—</span>;
          }

          return (
            <Button variant="outline" size="sm" onClick={() => checkOutTarget.open(row.original)}>
              <LogOut className="size-4" aria-hidden />
              Check out
            </Button>
          );
        },
      },
    ],
    [can, checkOutTarget],
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
            searchPlaceholder="Visitor name or phone…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setHostelFilter(ALL);
              setPresenceFilter('inside');
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

                <Select value={presenceFilter} onValueChange={setPresenceFilter}>
                  <SelectTrigger className="w-[11rem]" aria-label="Filter by presence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inside">Currently inside</SelectItem>
                    <SelectItem value={ALL}>Full log</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              can('HOSTEL', 'CREATE') && (
                <Button onClick={() => setIsFormOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  Log a visitor
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={UserRound}
            title={
              presenceFilter === 'inside' ? 'No visitors on the premises' : 'No visitors logged'
            }
            description="Every visit is logged with an entry and exit time for safeguarding."
            action={
              can('HOSTEL', 'CREATE') && (
                <Button onClick={() => setIsFormOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  Log a visitor
                </Button>
              )
            }
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="Log a visitor"
        description="The check-in time is recorded as now."
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel="Check in"
      >
        <Form {...form}>
          <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <FormField
              control={form.control}
              name="hostelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hostel</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a hostel" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(hostels.data ?? []).map((hostel) => (
                        <SelectItem key={hostel.id} value={hostel.id}>
                          {hostel.name} · {hostel.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="studentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resident being visited</FormLabel>
                  <FormControl>
                    <ResidentSelect
                      hostelId={form.watch('hostelId')}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    Only current residents of the selected hostel are listed.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="visitorName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visitor name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Full name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="relation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Father" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="idProofType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID proof type</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Aadhaar" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="idProofNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID proof number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Last 4 digits" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purpose</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="Optional" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>

      <ConfirmDialog
        open={checkOutTarget.isOpen}
        onOpenChange={checkOutTarget.onOpenChange}
        title="Check this visitor out?"
        description={
          <>
            <strong>{checkOutTarget.target?.visitorName}</strong> will be recorded as leaving now.
          </>
        }
        confirmLabel="Check out"
        onConfirm={async () => {
          if (checkOutTarget.target) {
            await checkOutMutation.mutateAsync(checkOutTarget.target);
          }
        }}
      />
    </>
  );
}

interface ResidentSelectProps {
  hostelId: string;
  value: string;
  onChange: (studentId: string) => void;
}

/** Residents of one hostel — a short list, so a plain select is enough. */
function ResidentSelect({ hostelId, value, onChange }: ResidentSelectProps) {
  const residents = useQuery({
    queryKey: ['hostel', 'allocations', 'residents', hostelId],
    queryFn: () =>
      hostelService.listAllocations({ limit: 100, hostelId, status: 'ACTIVE' }),
    select: (page) => page.items,
    enabled: hostelId.length > 0,
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={hostelId.length === 0}>
      <SelectTrigger className="w-full">
        <SelectValue
          placeholder={hostelId.length === 0 ? 'Select a hostel first' : 'Select a resident'}
        />
      </SelectTrigger>
      <SelectContent>
        {(residents.data ?? []).map((allocation) => (
          <SelectItem key={allocation.id} value={allocation.studentId}>
            {allocation.student.user.firstName} {allocation.student.user.lastName} · room{' '}
            {allocation.room.roomNumber}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
