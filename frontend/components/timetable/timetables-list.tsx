'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClock, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
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
import { formatDate } from '@/lib/format';
import { applyApiErrors } from '@/lib/form-errors';
import { academicService } from '@/services/academic.service';
import { timetableService } from '@/services/timetable.service';
import type { Timetable, TimetableListItem, TimetablePayload } from '@/types/timetable';

const NONE = '__none__';
const FORM_ID = 'timetable-form';
const QUERY_KEY = ['timetable', 'list'] as const;

const formSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    classId: z.string().uuid('Select a class'),
    sectionId: z.string().uuid('Select a section'),
    academicYearId: z.string().uuid('Select an academic year'),
    semesterId: z.string().optional(),
    effectiveFrom: z.string().min(1, 'Effective date is required'),
    effectiveTo: z.string().optional(),
    isActive: z.boolean(),
  })
  .refine(
    (data) => !data.effectiveTo || new Date(data.effectiveTo) > new Date(data.effectiveFrom),
    { message: 'The end date must be after the start date', path: ['effectiveTo'] },
  );

type FormValues = z.infer<typeof formSchema>;

export function TimetablesList() {
  const router = useRouter();
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'effectiveFrom', defaultSortOrder: 'desc' });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<TimetableListItem>();

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
  });

  const years = useQuery({
    queryKey: ['academics', 'academic-years', 'all'],
    queryFn: () => academicService.listYears({ limit: 100, sortBy: 'startDate', sortOrder: 'desc' }),
  });

  const semesters = useQuery({
    queryKey: ['academics', 'semesters', 'all'],
    queryFn: () => academicService.listSemesters({ limit: 100, sortBy: 'startDate', sortOrder: 'asc' }),
    enabled: isFormOpen,
  });

  const query = useQuery({
    queryKey: [...QUERY_KEY, table.queryParams],
    queryFn: () => timetableService.list(table.queryParams),
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    TimetablePayload,
    Partial<TimetablePayload>,
    Timetable
  >({
    queryKey: ['timetable'],
    entityName: 'timetable',
    create: timetableService.create,
    update: timetableService.update,
    remove: timetableService.remove,
    onSuccess: () => setIsFormOpen(false),
  });

  const currentYearId = years.data?.items.find((year) => year.isCurrent)?.id ?? '';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      classId: '',
      sectionId: '',
      academicYearId: '',
      semesterId: NONE,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: '',
      isActive: true,
    },
  });

  const selectedClassId = form.watch('classId');

  const sectionChoices = useMemo(
    () => classOptions.data?.find((option) => option.id === selectedClassId)?.sections ?? [],
    [classOptions.data, selectedClassId],
  );

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset({
      name: '',
      classId: '',
      sectionId: '',
      academicYearId: currentYearId,
      semesterId: NONE,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: '',
      isActive: true,
    });
  }, [isFormOpen, form, currentYearId]);

  const onSubmit = async (values: FormValues) => {
    try {
      const created = await createMutation.mutateAsync({
        name: values.name,
        classId: values.classId,
        sectionId: values.sectionId,
        academicYearId: values.academicYearId,
        semesterId: values.semesterId === NONE ? null : (values.semesterId ?? null),
        effectiveFrom: values.effectiveFrom,
        ...(values.effectiveTo ? { effectiveTo: values.effectiveTo } : {}),
        isActive: values.isActive,
      });
      // Straight into the grid editor — an empty timetable is not useful.
      router.push(`/timetable/${created.id}`);
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'name',
        'classId',
        'sectionId',
        'academicYearId',
        'effectiveFrom',
        'effectiveTo',
      ]);
    }
  };

  const columns: ColumnDef<TimetableListItem, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Timetable',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="text-muted-foreground truncate text-sm">
            {row.original.class.name} — {row.original.section.name}
          </p>
        </div>
      ),
    },
    {
      id: 'year',
      header: 'Academic year',
      meta: { hideOnMobile: true },
      cell: ({ row }) => (
        <span>
          {row.original.academicYear.name}
          {row.original.semester ? ` · ${row.original.semester.name}` : ''}
        </span>
      ),
    },
    {
      accessorKey: 'effectiveFrom',
      header: 'Effective',
      meta: { sortKey: 'effectiveFrom', hideOnMobile: true },
      cell: ({ row }) =>
        row.original.effectiveTo
          ? `${formatDate(row.original.effectiveFrom)} – ${formatDate(row.original.effectiveTo)}`
          : `From ${formatDate(row.original.effectiveFrom)}`,
    },
    {
      id: 'slots',
      header: 'Slots',
      meta: { hideOnMobile: true, cellClassName: 'tabular-nums' },
      cell: ({ row }) => row.original._count.slots,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'ACTIVE' : 'DRAFT'} />,
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
            <DropdownMenuItem onClick={() => router.push(`/timetable/${row.original.id}`)}>
              <Pencil className="size-4" aria-hidden />
              Open grid
            </DropdownMenuItem>

            {can('TIMETABLE', 'EDIT') && !row.original.isActive && (
              <DropdownMenuItem
                onClick={() =>
                  void updateMutation.mutateAsync({
                    id: row.original.id,
                    payload: { isActive: true },
                  })
                }
              >
                <Star className="size-4" aria-hidden />
                Make active
              </DropdownMenuItem>
            )}

            {can('TIMETABLE', 'DELETE') && (
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
        onRowClick={(row) => router.push(`/timetable/${row.id}`)}
        toolbar={
          <DataTableToolbar
            search={table.state.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Search timetables…"
            isFiltered={table.state.search.length > 0}
            onReset={table.reset}
            actions={
              can('TIMETABLE', 'CREATE') && (
                <Button onClick={() => setIsFormOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  New timetable
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={CalendarClock}
            title="No timetables yet"
            description="Create a timetable for a section, then fill the weekly grid."
            action={
              can('TIMETABLE', 'CREATE') && (
                <Button onClick={() => setIsFormOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  New timetable
                </Button>
              )
            }
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="New timetable"
        description="Only one timetable per section can be active at a time."
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel="Create and open grid"
        size="lg"
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
                    <Input {...field} placeholder="Term 1 timetable" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="classId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Class</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('sectionId', '');
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a class" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(classOptions.data ?? []).map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name} ({option.code})
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
                name="sectionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!selectedClassId}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a section" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sectionChoices.map((section) => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.name}
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
                name="academicYearId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Academic year</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
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

              <FormField
                control={form.control}
                name="semesterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Semester</FormLabel>
                    <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Full year" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Full year</SelectItem>
                        {(semesters.data?.items ?? []).map((semester) => (
                          <SelectItem key={semester.id} value={semester.id}>
                            {semester.name}
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
                name="effectiveFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective from</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="effectiveTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective to</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormDescription>Leave blank for open-ended.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-lg border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      id="timetable-active"
                    />
                  </FormControl>
                  <div className="space-y-1">
                    <FormLabel htmlFor="timetable-active" className="cursor-pointer">
                      Make this the active timetable for the section
                    </FormLabel>
                    <FormDescription>
                      Any other active timetable for this section is deactivated. Only active
                      timetables take part in conflict checking.
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
        title="Delete this timetable?"
        description={
          <>
            <strong>{deleteTarget.target?.name}</strong> and all of its slots will be removed.
          </>
        }
        confirmLabel="Delete timetable"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget.target) await deleteMutation.mutateAsync(deleteTarget.target.id);
        }}
      />
    </>
  );
}
