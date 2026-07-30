'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarRange, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
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
  type AcademicYear,
  type AcademicYearPayload,
} from '@/types/academic';

const STATUSES: AcademicTermStatus[] = ['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];

const formSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(50),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    isCurrent: z.boolean(),
    status: z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED']),
  })
  .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: 'The end date must be after the start date',
    path: ['endDate'],
  });

type FormValues = z.infer<typeof formSchema>;

const FORM_ID = 'academic-year-form';
const QUERY_KEY = ['academics', 'academic-years'] as const;

export function AcademicYearsTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'startDate', defaultSortOrder: 'desc' });
  const [editing, setEditing] = useState<AcademicYear | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<AcademicYear>();

  const query = useQuery({
    queryKey: [...QUERY_KEY, table.queryParams],
    queryFn: () => academicService.listYears(table.queryParams),
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    AcademicYearPayload,
    Partial<AcademicYearPayload>,
    AcademicYear
  >({
    queryKey: QUERY_KEY,
    entityName: 'academic year',
    create: academicService.createYear,
    update: academicService.updateYear,
    remove: academicService.deleteYear,
    onSuccess: () => setIsFormOpen(false),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      startDate: '',
      endDate: '',
      isCurrent: false,
      status: 'UPCOMING',
    },
  });

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            startDate: toDateInputValue(editing.startDate),
            endDate: toDateInputValue(editing.endDate),
            isCurrent: editing.isCurrent,
            status: editing.status,
          }
        : { name: '', startDate: '', endDate: '', isCurrent: false, status: 'UPCOMING' },
    );
  }, [isFormOpen, editing, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, payload: values });
      } else {
        await createMutation.mutateAsync(values);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, ['name', 'startDate', 'endDate', 'status']);
    }
  };

  const makeCurrent = async (year: AcademicYear) => {
    await updateMutation.mutateAsync({ id: year.id, payload: { isCurrent: true } });
  };

  const columns: ColumnDef<AcademicYear, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Academic year',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.name}</span>
          {row.original.isCurrent && (
            <Badge className="bg-primary-muted text-primary border-transparent">
              <Star className="size-3" aria-hidden />
              Current
            </Badge>
          )}
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
              <>
                <DropdownMenuItem onClick={() => { setEditing(row.original); setIsFormOpen(true); }}>
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </DropdownMenuItem>
                {!row.original.isCurrent && (
                  <DropdownMenuItem onClick={() => void makeCurrent(row.original)}>
                    <Star className="size-4" aria-hidden />
                    Make current
                  </DropdownMenuItem>
                )}
              </>
            )}
            {can('ACADEMICS', 'DELETE') && !row.original.isCurrent && (
              <DropdownMenuItem variant="destructive" onClick={() => deleteTarget.open(row.original)}>
                <Trash2 className="size-4" aria-hidden />
                Archive
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
            searchPlaceholder="Search academic years…"
            isFiltered={table.state.search.length > 0}
            onReset={table.reset}
            actions={
              can('ACADEMICS', 'CREATE') && (
                <Button onClick={() => { setEditing(null); setIsFormOpen(true); }}>
                  <Plus className="size-4" aria-hidden />
                  New academic year
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={CalendarRange}
            title="No academic years yet"
            description="Every class, exam and invoice belongs to an academic year. Create the first one to begin."
            action={
              can('ACADEMICS', 'CREATE') && (
                <Button onClick={() => { setEditing(null); setIsFormOpen(true); }}>
                  <Plus className="size-4" aria-hidden />
                  New academic year
                </Button>
              )
            }
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit academic year' : 'New academic year'}
        description="Academic years must not overlap one another."
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Create academic year'}
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
                    <Input {...field} placeholder="2026-2027" autoFocus />
                  </FormControl>
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

            <FormField
              control={form.control}
              name="isCurrent"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-lg border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      id="isCurrent"
                    />
                  </FormControl>
                  <div className="space-y-1">
                    <FormLabel htmlFor="isCurrent" className="cursor-pointer">
                      Make this the current academic year
                    </FormLabel>
                    <FormDescription>
                      New records default to the current year. Only one year can hold this at a time.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>

      <ConfirmDialog
        open={deleteTarget.isOpen}
        onOpenChange={deleteTarget.onOpenChange}
        title="Archive this academic year?"
        description={
          <>
            <strong>{deleteTarget.target?.name}</strong> will be archived. This is only possible
            while no classes, students, exams or invoices reference it.
          </>
        }
        confirmLabel="Archive year"
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
