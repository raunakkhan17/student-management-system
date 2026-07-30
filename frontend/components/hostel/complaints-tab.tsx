'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { MessageSquareWarning, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
import { StatusBadge } from '@/components/common/status-badge';
import { StudentPicker } from '@/components/common/student-picker';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Badge } from '@/components/ui/badge';
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
import { formatDate } from '@/lib/format';
import { hostelService } from '@/services/hostel.service';
import {
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_STATUS_LABELS,
  PRIORITY_LABELS,
  type ComplaintCategory,
  type ComplaintStatus,
  type HostelComplaint,
  type Priority,
} from '@/types/hostel';

const ALL = '__all__';
const RAISE_FORM_ID = 'hostel-complaint-form';
const UPDATE_FORM_ID = 'hostel-complaint-update-form';

const CATEGORIES: ComplaintCategory[] = [
  'MAINTENANCE',
  'CLEANLINESS',
  'FOOD',
  'SECURITY',
  'ELECTRICITY',
  'PLUMBING',
  'INTERNET',
  'OTHER',
];
const STATUSES: ComplaintStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED'];
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const raiseFormSchema = z.object({
  hostelId: z.string().uuid('Select a hostel'),
  studentId: z.string().optional(),
  category: z.enum([
    'MAINTENANCE',
    'CLEANLINESS',
    'FOOD',
    'SECURITY',
    'ELECTRICITY',
    'PLUMBING',
    'INTERNET',
    'OTHER',
  ]),
  title: z.string().trim().min(1, 'A short title is required').max(200),
  description: z.string().trim().min(1, 'Describe the problem').max(2000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
});

const updateFormSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  resolution: z.string().trim().max(2000).optional(),
});

type RaiseFormValues = z.infer<typeof raiseFormSchema>;
type UpdateFormValues = z.infer<typeof updateFormSchema>;

/** Urgency tone, so an URGENT row reads the same as a danger status elsewhere. */
const PRIORITY_TONE: Record<Priority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

export function ComplaintsTab() {
  const { can, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const table = useTableState({ defaultSortBy: 'createdAt', defaultSortOrder: 'desc' });
  const hostels = useHostelOptions();

  const [hostelFilter, setHostelFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [isRaiseOpen, setIsRaiseOpen] = useState(false);
  const [updateTarget, setUpdateTarget] = useState<HostelComplaint | null>(null);

  const isStudent = hasRole('STUDENT');

  const params = {
    ...table.queryParams,
    ...(hostelFilter !== ALL ? { hostelId: hostelFilter } : {}),
    ...(statusFilter !== ALL ? { status: statusFilter } : {}),
  };

  const query = useQuery({
    queryKey: ['hostel', 'complaints', params],
    queryFn: () => hostelService.listComplaints(params),
  });

  const raiseForm = useForm<RaiseFormValues>({
    resolver: zodResolver(raiseFormSchema),
    defaultValues: {
      hostelId: '',
      studentId: '',
      category: 'MAINTENANCE',
      title: '',
      description: '',
      priority: 'MEDIUM',
    },
  });

  const updateForm = useForm<UpdateFormValues>({
    resolver: zodResolver(updateFormSchema),
    defaultValues: { status: 'IN_PROGRESS', priority: 'MEDIUM', resolution: '' },
  });

  useEffect(() => {
    if (!isRaiseOpen) return;
    raiseForm.reset({
      hostelId: hostelFilter !== ALL ? hostelFilter : '',
      studentId: '',
      category: 'MAINTENANCE',
      title: '',
      description: '',
      priority: 'MEDIUM',
    });
  }, [isRaiseOpen, hostelFilter, raiseForm]);

  useEffect(() => {
    if (!updateTarget) return;
    updateForm.reset({
      status: updateTarget.status,
      priority: updateTarget.priority,
      resolution: updateTarget.resolution ?? '',
    });
  }, [updateTarget, updateForm]);

  const raiseMutation = useMutation({
    mutationFn: (values: RaiseFormValues) =>
      hostelService.createComplaint({
        hostelId: values.hostelId,
        category: values.category,
        title: values.title,
        description: values.description,
        priority: values.priority,
        ...(values.studentId ? { studentId: values.studentId } : {}),
      }),
    onSuccess: async () => {
      toast.success('Complaint raised');
      await queryClient.invalidateQueries({ queryKey: ['hostel'] });
      setIsRaiseOpen(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not raise the complaint');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: UpdateFormValues) => {
      if (!updateTarget) throw new Error('No complaint selected');
      return hostelService.updateComplaint(updateTarget.id, {
        status: values.status,
        priority: values.priority,
        ...(values.resolution ? { resolution: values.resolution } : {}),
      });
    },
    onSuccess: async () => {
      toast.success('Complaint updated');
      await queryClient.invalidateQueries({ queryKey: ['hostel'] });
      setUpdateTarget(null);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not update the complaint');
    },
  });

  const isFiltered = table.state.search.length > 0 || hostelFilter !== ALL || statusFilter !== ALL;

  const columns = useMemo<ColumnDef<HostelComplaint, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Complaint',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.title}</p>
            <p className="text-muted-foreground truncate text-sm">
              {COMPLAINT_CATEGORY_LABELS[row.original.category]} · {row.original.hostel.name}
              {row.original.room ? ` · room ${row.original.room.roomNumber}` : ''}
            </p>
          </div>
        ),
      },
      {
        id: 'student',
        header: 'Raised by',
        meta: { hideOnMobile: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">
              {row.original.student.user.firstName} {row.original.student.user.lastName}
            </p>
            <p className="text-muted-foreground truncate text-sm">
              {formatDate(row.original.createdAt)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'priority',
        header: 'Priority',
        meta: { sortKey: 'priority' },
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.priority}
            tone={PRIORITY_TONE[row.original.priority]}
            label={PRIORITY_LABELS[row.original.priority]}
          />
        ),
      },
      {
        id: 'assignedTo',
        header: 'Assigned to',
        meta: { hideOnMobile: true },
        cell: ({ row }) => {
          const { assignedTo } = row.original;
          return assignedTo ? (
            <Badge variant="secondary">
              {assignedTo.firstName} {assignedTo.lastName}
            </Badge>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            label={COMPLAINT_STATUS_LABELS[row.original.status]}
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        meta: { cellClassName: 'w-24' },
        cell: ({ row }) => {
          if (!can('HOSTEL', 'EDIT')) {
            return <span className="text-muted-foreground text-sm">—</span>;
          }

          return (
            <Button variant="outline" size="sm" onClick={() => setUpdateTarget(row.original)}>
              Update
            </Button>
          );
        },
      },
    ],
    [can],
  );

  const status = updateForm.watch('status');

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
            searchPlaceholder="Search complaints…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setHostelFilter(ALL);
              setStatusFilter(ALL);
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
                  <SelectTrigger className="w-[11rem]" aria-label="Filter by status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    {STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {COMPLAINT_STATUS_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              can('HOSTEL', 'CREATE') && (
                <Button onClick={() => setIsRaiseOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  Raise a complaint
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={MessageSquareWarning}
            title={isFiltered ? 'No matching complaints' : 'No complaints'}
            description={
              isFiltered
                ? 'Try a different filter or search term.'
                : 'Residents can report maintenance, food or security issues here.'
            }
            action={
              can('HOSTEL', 'CREATE') && (
                <Button onClick={() => setIsRaiseOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  Raise a complaint
                </Button>
              )
            }
          />
        }
      />

      <FormDialog
        open={isRaiseOpen}
        onOpenChange={setIsRaiseOpen}
        title="Raise a complaint"
        description="Urgent issues are escalated to the warden immediately."
        formId={RAISE_FORM_ID}
        isSubmitting={raiseForm.formState.isSubmitting}
        submitLabel="Raise complaint"
      >
        <Form {...raiseForm}>
          <form
            id={RAISE_FORM_ID}
            className="space-y-5"
            noValidate
            onSubmit={raiseForm.handleSubmit(async (values) => {
              try {
                await raiseMutation.mutateAsync(values);
              } catch (error) {
                applyApiErrors(error, raiseForm.setError, [
                  'hostelId',
                  'studentId',
                  'category',
                  'title',
                  'description',
                  'priority',
                ]);
              }
            })}
          >
            <FormField
              control={raiseForm.control}
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

            {!isStudent && (
              <FormField
                control={raiseForm.control}
                name="studentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>On behalf of</FormLabel>
                    <FormControl>
                      <StudentPicker
                        value={field.value || null}
                        onChange={(id) => field.onChange(id ?? '')}
                        clearable
                      />
                    </FormControl>
                    <FormDescription>The resident this complaint relates to.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={raiseForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {COMPLAINT_CATEGORY_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={raiseForm.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITIES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {PRIORITY_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={raiseForm.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Leaking tap in the bathroom" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={raiseForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Details</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={4} placeholder="What is wrong, and since when?" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>

      <FormDialog
        open={updateTarget !== null}
        onOpenChange={(open) => !open && setUpdateTarget(null)}
        title="Update complaint"
        description={updateTarget?.title}
        formId={UPDATE_FORM_ID}
        isSubmitting={updateForm.formState.isSubmitting}
        submitLabel="Save update"
      >
        <Form {...updateForm}>
          <form
            id={UPDATE_FORM_ID}
            className="space-y-5"
            noValidate
            onSubmit={updateForm.handleSubmit(async (values) => {
              try {
                await updateMutation.mutateAsync(values);
              } catch (error) {
                applyApiErrors(error, updateForm.setError, ['status', 'priority', 'resolution']);
              }
            })}
          >
            {updateTarget && (
              <p className="text-muted-foreground text-sm">{updateTarget.description}</p>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={updateForm.control}
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
                        {STATUSES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {COMPLAINT_STATUS_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={updateForm.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITIES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {PRIORITY_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={updateForm.control}
              name="resolution"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resolution</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="What was done" />
                  </FormControl>
                  <FormDescription>
                    {status === 'RESOLVED' || status === 'CLOSED'
                      ? 'Shown to the resident when the complaint closes.'
                      : 'Optional progress note.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>
    </>
  );
}
