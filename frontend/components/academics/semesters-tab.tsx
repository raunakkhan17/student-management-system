'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClock, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
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
import { useAuth } from '@/hooks/use-auth';
import { useCrudMutations } from '@/hooks/use-crud-mutations';
import { useTableState } from '@/hooks/use-table-state';
import { formatDate, toDateInputValue } from '@/lib/format';
import { applyApiErrors } from '@/lib/form-errors';
import { academicService } from '@/services/academic.service';
import {
  ACADEMIC_TERM_STATUS_LABELS,
  type AcademicTermStatus,
  type Semester,
  type SemesterPayload,
} from '@/types/academic';

const ALL = '__all__';
const STATUSES: AcademicTermStatus[] = ['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];

const formSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(50),
    academicYearId: z.string().uuid('Select an academic year'),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    status: z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED']),
  })
  .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: 'The end date must be after the start date',
    path: ['endDate'],
  });

type FormValues = z.infer<typeof formSchema>;

const FORM_ID = 'semester-form';
const QUERY_KEY = ['academics', 'semesters'] as const;

export function SemestersTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'startDate', defaultSortOrder: 'asc' });
  const [yearFilter, setYearFilter] = useState<string>(ALL);
  const [editing, setEditing] = useState<Semester | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<Semester>();

  const years = useQuery({
    queryKey: ['academics', 'academic-years', 'all'],
    queryFn: () => academicService.listYears({ limit: 100, sortBy: 'startDate', sortOrder: 'desc' }),
  });

  const params = {
    ...table.queryParams,
    ...(yearFilter !== ALL ? { academicYearId: yearFilter } : {}),
  };

  const query = useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () => academicService.listSemesters(params),
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    SemesterPayload,
    Partial<SemesterPayload>,
    Semester
  >({
    queryKey: QUERY_KEY,
    entityName: 'semester',
    create: academicService.createSemester,
    update: academicService.updateSemester,
    remove: academicService.deleteSemester,
    onSuccess: () => setIsFormOpen(false),
  });

  const currentYearId = years.data?.items.find((year) => year.isCurrent)?.id ?? '';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', academicYearId: '', startDate: '', endDate: '', status: 'UPCOMING' },
  });

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            academicYearId: editing.academicYearId,
            startDate: toDateInputValue(editing.startDate),
            endDate: toDateInputValue(editing.endDate),
            status: editing.status,
          }
        : {
            name: '',
            academicYearId: currentYearId,
            startDate: '',
            endDate: '',
            status: 'UPCOMING',
          },
    );
  }, [isFormOpen, editing, form, currentYearId]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (editing) {
        // The parent academic year cannot be changed after creation.
        const { academicYearId: _ignored, ...rest } = values;
        await updateMutation.mutateAsync({ id: editing.id, payload: rest });
      } else {
        await createMutation.mutateAsync(values);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, ['name', 'academicYearId', 'startDate', 'endDate']);
    }
  };

  const isFiltered = table.state.search.length > 0 || yearFilter !== ALL;

  const columns: ColumnDef<Semester, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Semester',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="text-muted-foreground truncate text-sm">{row.original.academicYear.name}</p>
        </div>
      ),
    },
    {
      accessorKey: 'startDate',
      header: 'Starts',
      meta: { sortKey: 'startDate', hideOnMobile: true },
      cell: ({ row }) => formatDate(row.original.startDate),
    },
    {
      accessorKey: 'endDate',
      header: 'Ends',
      meta: { sortKey: 'endDate', hideOnMobile: true },
      cell: ({ row }) => formatDate(row.original.endDate),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'usage',
      header: 'In use',
      meta: { hideOnMobile: true },
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original._count.classSubjects} offerings · {row.original._count.exams} exams
        </span>
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
            {can('ACADEMICS', 'EDIT') && (
              <DropdownMenuItem onClick={() => { setEditing(row.original); setIsFormOpen(true); }}>
                <Pencil className="size-4" aria-hidden />
                Edit
              </DropdownMenuItem>
            )}
            {can('ACADEMICS', 'DELETE') && (
              <DropdownMenuItem variant="destructive" onClick={() => deleteTarget.open(row.original)}>
                <Trash2 className="size-4" aria-hidden />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

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
            searchPlaceholder="Search semesters…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setYearFilter(ALL);
            }}
            filters={
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-[11rem]" aria-label="Filter by academic year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All academic years</SelectItem>
                  {(years.data?.items ?? []).map((year) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            actions={
              can('ACADEMICS', 'CREATE') && (
                <Button onClick={() => { setEditing(null); setIsFormOpen(true); }}>
                  <Plus className="size-4" aria-hidden />
                  New semester
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={CalendarClock}
            title={isFiltered ? 'No matching semesters' : 'No semesters yet'}
            description="Semesters divide an academic year and scope subject offerings and exams."
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit semester' : 'New semester'}
        description="Semester dates must fall inside the parent academic year."
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Create semester'}
      >
        <Form {...form}>
          <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Semester 1" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="academicYearId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Academic year</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={editing !== null}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select an academic year" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(years.data?.items ?? []).map((year) => (
                        <SelectItem key={year.id} value={year.id}>
                          {year.name}
                          {year.isCurrent ? ' (current)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {editing && (
                    <FormDescription>
                      The academic year cannot be changed after a semester is created.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                          {ACADEMIC_TERM_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
        title="Delete this semester?"
        description={
          <>
            <strong>{deleteTarget.target?.name}</strong> will be removed. This is only possible while
            no subject offerings or exams reference it.
          </>
        }
        confirmLabel="Delete semester"
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
