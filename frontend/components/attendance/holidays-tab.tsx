'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarOff, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
import { PageHeader } from '@/components/common/page-header';
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
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useCrudMutations } from '@/hooks/use-crud-mutations';
import { useTableState } from '@/hooks/use-table-state';
import { formatDate, toDateInputValue } from '@/lib/format';
import { applyApiErrors } from '@/lib/form-errors';
import { academicService } from '@/services/academic.service';
import { attendanceService } from '@/services/attendance.service';
import type { Holiday, HolidayPayload } from '@/types/attendance';

const FORM_ID = 'holiday-form';
const QUERY_KEY = ['attendance', 'holidays'] as const;

const formSchema = z
  .object({
    academicYearId: z.string().uuid('Select an academic year'),
    name: z.string().trim().min(1, 'Name is required').max(120),
    date: z.string().min(1, 'Date is required'),
    endDate: z.string().optional(),
    description: z.string().trim().max(300).optional(),
  })
  .refine((data) => !data.endDate || new Date(data.endDate) >= new Date(data.date), {
    message: 'The end date cannot be before the start date',
    path: ['endDate'],
  });

type FormValues = z.infer<typeof formSchema>;

export function HolidaysTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'date', defaultSortOrder: 'asc' });
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<Holiday>();

  const years = useQuery({
    queryKey: ['academics', 'academic-years', 'all'],
    queryFn: () => academicService.listYears({ limit: 100, sortBy: 'startDate', sortOrder: 'desc' }),
  });

  const query = useQuery({
    queryKey: [...QUERY_KEY, table.queryParams],
    queryFn: () => attendanceService.listHolidays(table.queryParams),
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    HolidayPayload,
    Partial<Omit<HolidayPayload, 'academicYearId'>>,
    Holiday
  >({
    queryKey: QUERY_KEY,
    entityName: 'holiday',
    create: attendanceService.createHoliday,
    update: attendanceService.updateHoliday,
    remove: attendanceService.deleteHoliday,
    onSuccess: () => setIsFormOpen(false),
  });

  const currentYearId = years.data?.items.find((year) => year.isCurrent)?.id ?? '';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { academicYearId: '', name: '', date: '', endDate: '', description: '' },
  });

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            academicYearId: editing.academicYearId,
            name: editing.name,
            date: toDateInputValue(editing.date),
            endDate: editing.endDate ? toDateInputValue(editing.endDate) : '',
            description: editing.description ?? '',
          }
        : {
            academicYearId: currentYearId,
            name: '',
            date: '',
            endDate: '',
            description: '',
          },
    );
  }, [isFormOpen, editing, form, currentYearId]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          payload: {
            name: values.name,
            date: values.date,
            ...(values.endDate ? { endDate: values.endDate } : {}),
            ...(values.description ? { description: values.description } : {}),
          },
        });
      } else {
        await createMutation.mutateAsync({
          academicYearId: values.academicYearId,
          name: values.name,
          date: values.date,
          ...(values.endDate ? { endDate: values.endDate } : {}),
          ...(values.description ? { description: values.description } : {}),
        });
      }
    } catch (error) {
      applyApiErrors(error, form.setError, ['academicYearId', 'name', 'date', 'endDate']);
    }
  };

  const columns: ColumnDef<Holiday, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Holiday',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          {row.original.description && (
            <p className="text-muted-foreground truncate text-sm">{row.original.description}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'date',
      header: 'Date',
      meta: { sortKey: 'date' },
      cell: ({ row }) =>
        row.original.endDate
          ? `${formatDate(row.original.date)} – ${formatDate(row.original.endDate)}`
          : formatDate(row.original.date),
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
            {can('ATTENDANCE', 'EDIT') && (
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
            {can('ATTENDANCE', 'DELETE') && (
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
    <div>
      <PageHeader
        title="Holidays"
        description="Holidays are excluded from attendance percentages and flagged on the marking sheet."
      />

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
            searchPlaceholder="Search holidays…"
            isFiltered={table.state.search.length > 0}
            onReset={table.reset}
            actions={
              can('ATTENDANCE', 'CREATE') && (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setIsFormOpen(true);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add holiday
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={CalendarOff}
            title="No holidays recorded"
            description="Add the institution's holiday calendar so attendance percentages stay accurate."
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit holiday' : 'Add a holiday'}
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Add holiday'}
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
                    <Input {...field} placeholder="Diwali" autoFocus />
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
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
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
                    <FormDescription>Leave blank for a single day.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} />
                  </FormControl>
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
        title="Delete this holiday?"
        description={
          <>
            <strong>{deleteTarget.target?.name}</strong> will be removed from the calendar.
          </>
        }
        confirmLabel="Delete holiday"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget.target) await deleteMutation.mutateAsync(deleteTarget.target.id);
        }}
      />
    </div>
  );
}
