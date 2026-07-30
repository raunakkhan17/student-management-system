'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Plus, ScrollText, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
import { PageHeader } from '@/components/common/page-header';
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
import { formatDate } from '@/lib/format';
import { applyApiErrors } from '@/lib/form-errors';
import { academicService } from '@/services/academic.service';
import { examService } from '@/services/exam.service';
import {
  EXAM_STATUS_LABELS,
  EXAM_TYPE_LABELS,
  type ExamDetail,
  type ExamListItem,
  type ExamPayload,
  type ExamStatus,
  type ExamType,
} from '@/types/exam';

const ALL = '__all__';
const NONE = '__none__';
const FORM_ID = 'exam-form';
const QUERY_KEY = ['exams'] as const;

const EXAM_TYPES: ExamType[] = ['UNIT_TEST', 'MID_SEMESTER', 'SEMESTER', 'FINAL', 'PRACTICAL'];
const EXAM_STATUSES: ExamStatus[] = [
  'DRAFT',
  'SCHEDULED',
  'ONGOING',
  'COMPLETED',
  'RESULTS_PUBLISHED',
  'CANCELLED',
];

const formSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(160),
    type: z.enum(['UNIT_TEST', 'MID_SEMESTER', 'SEMESTER', 'FINAL', 'PRACTICAL']),
    academicYearId: z.string().uuid('Select an academic year'),
    semesterId: z.string().optional(),
    classId: z.string().optional(),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    gradeScaleId: z.string().optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: 'The end date cannot be before the start date',
    path: ['endDate'],
  });

type FormValues = z.infer<typeof formSchema>;

export function ExamsList() {
  const router = useRouter();
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'startDate', defaultSortOrder: 'desc' });

  const [typeFilter, setTypeFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [editing, setEditing] = useState<ExamListItem | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<ExamListItem>();

  const years = useQuery({
    queryKey: ['academics', 'academic-years', 'all'],
    queryFn: () => academicService.listYears({ limit: 100, sortBy: 'startDate', sortOrder: 'desc' }),
  });

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
    enabled: isFormOpen,
  });

  const semesters = useQuery({
    queryKey: ['academics', 'semesters', 'all'],
    queryFn: () => academicService.listSemesters({ limit: 100, sortBy: 'startDate', sortOrder: 'asc' }),
    enabled: isFormOpen,
  });

  const gradeScales = useQuery({
    queryKey: ['exams', 'grade-scales'],
    queryFn: () => examService.listGradeScales(),
    enabled: isFormOpen,
  });

  const params = {
    ...table.queryParams,
    ...(typeFilter !== ALL ? { type: typeFilter as ExamType } : {}),
    ...(statusFilter !== ALL ? { status: statusFilter } : {}),
  };

  const query = useQuery({
    queryKey: [...QUERY_KEY, 'list', params],
    queryFn: () => examService.list(params),
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    ExamPayload,
    Partial<ExamPayload>,
    ExamDetail
  >({
    queryKey: QUERY_KEY,
    entityName: 'exam',
    create: examService.create,
    update: examService.update,
    remove: examService.remove,
    onSuccess: () => setIsFormOpen(false),
  });

  const currentYearId = years.data?.items.find((year) => year.isCurrent)?.id ?? '';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      type: 'UNIT_TEST',
      academicYearId: '',
      semesterId: NONE,
      classId: NONE,
      startDate: '',
      endDate: '',
      gradeScaleId: NONE,
      description: '',
    },
  });

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            type: editing.type,
            academicYearId: editing.academicYearId,
            semesterId: editing.semesterId ?? NONE,
            classId: editing.classId ?? NONE,
            startDate: editing.startDate.slice(0, 10),
            endDate: editing.endDate.slice(0, 10),
            gradeScaleId: editing.gradeScaleId ?? NONE,
            description: editing.description ?? '',
          }
        : {
            name: '',
            type: 'UNIT_TEST',
            academicYearId: currentYearId,
            semesterId: NONE,
            classId: NONE,
            startDate: '',
            endDate: '',
            gradeScaleId: NONE,
            description: '',
          },
    );
  }, [isFormOpen, editing, form, currentYearId]);

  const onSubmit = async (values: FormValues) => {
    const payload: ExamPayload = {
      name: values.name,
      type: values.type,
      academicYearId: values.academicYearId,
      semesterId: values.semesterId === NONE ? null : (values.semesterId ?? null),
      classId: values.classId === NONE ? null : (values.classId ?? null),
      startDate: values.startDate,
      endDate: values.endDate,
      gradeScaleId: values.gradeScaleId === NONE ? null : (values.gradeScaleId ?? null),
      ...(values.description ? { description: values.description } : {}),
    };

    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, payload });
      } else {
        const created = await createMutation.mutateAsync(payload);
        // Straight into the exam so papers can be scheduled.
        router.push(`/exams/${created.id}`);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'name',
        'type',
        'academicYearId',
        'startDate',
        'endDate',
      ]);
    }
  };

  const isFiltered = table.state.search.length > 0 || typeFilter !== ALL || statusFilter !== ALL;

  const columns: ColumnDef<ExamListItem, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Exam',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="text-muted-foreground truncate text-sm">
            {EXAM_TYPE_LABELS[row.original.type]} · {row.original.academicYear.name}
            {row.original.class ? ` · ${row.original.class.name}` : ''}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'startDate',
      header: 'Window',
      meta: { sortKey: 'startDate', hideOnMobile: true },
      cell: ({ row }) =>
        `${formatDate(row.original.startDate)} – ${formatDate(row.original.endDate)}`,
    },
    {
      id: 'papers',
      header: 'Papers',
      meta: { hideOnMobile: true },
      cell: ({ row }) => <Badge variant="secondary">{row.original._count.schedules}</Badge>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge status={row.original.status} label={EXAM_STATUS_LABELS[row.original.status]} />
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
            <DropdownMenuItem onClick={() => router.push(`/exams/${row.original.id}`)}>
              Open exam
            </DropdownMenuItem>

            {can('EXAMS', 'EDIT') && row.original.status !== 'RESULTS_PUBLISHED' && (
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

            {can('EXAMS', 'DELETE') && row.original.status !== 'RESULTS_PUBLISHED' && (
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
        title="Examinations"
        description="Create exams, schedule papers, enter marks and publish results."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Examinations' }]}
        actions={
          can('EXAMS', 'CREATE') && (
            <Button
              onClick={() => {
                setEditing(null);
                setIsFormOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              New exam
            </Button>
          )
        }
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
        onRowClick={(row) => router.push(`/exams/${row.id}`)}
        toolbar={
          <DataTableToolbar
            search={table.state.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Search exams…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setTypeFilter(ALL);
              setStatusFilter(ALL);
            }}
            filters={
              <>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[10.5rem]" aria-label="Filter by type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All types</SelectItem>
                    {EXAM_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {EXAM_TYPE_LABELS[type]}
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
                    {EXAM_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {EXAM_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
          />
        }
        emptyState={
          <EmptyState
            icon={ScrollText}
            title={isFiltered ? 'No matching exams' : 'No exams yet'}
            description="Create an exam, schedule its subject papers, then enter marks."
            action={
              !isFiltered &&
              can('EXAMS', 'CREATE') && (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setIsFormOpen(true);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  New exam
                </Button>
              )
            }
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit exam' : 'New exam'}
        description="Leave the class blank for an institution-wide exam covering several classes."
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Create and schedule papers'}
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
                    <Input {...field} placeholder="Unit Test 1 — Term 1" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EXAM_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {EXAM_TYPE_LABELS[type]}
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
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Starts</FormLabel>
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
                    <FormLabel>Ends</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="classId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Class</FormLabel>
                    <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="All classes" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>All classes</SelectItem>
                        {(classOptions.data ?? []).map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
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
            </div>

            <FormField
              control={form.control}
              name="gradeScaleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grade scale</FormLabel>
                  <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Institution default" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Institution default</SelectItem>
                      {(gradeScales.data ?? []).map((scale) => (
                        <SelectItem key={scale.id} value={scale.id}>
                          {scale.name}
                          {scale.isDefault ? ' (default)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Determines the grades and grade points awarded when results are published.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
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
        title="Delete this exam?"
        description={
          <>
            <strong>{deleteTarget.target?.name}</strong> and its papers will be removed. This is only
            possible while no results have been published.
          </>
        }
        confirmLabel="Delete exam"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget.target) await deleteMutation.mutateAsync(deleteTarget.target.id);
        }}
      />
    </div>
  );
}
