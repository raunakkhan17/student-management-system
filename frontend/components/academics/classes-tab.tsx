'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Layers, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
import { applyApiErrors } from '@/lib/form-errors';
import { academicService } from '@/services/academic.service';
import { teacherService } from '@/services/teacher.service';
import type { ClassPayload, ClassRecord } from '@/types/academic';

const ALL = '__all__';
const NONE = '__none__';

const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and dashes only'),
  academicYearId: z.string().uuid('Select an academic year'),
  departmentId: z.string().optional(),
  courseId: z.string().optional(),
  yearLevel: z.coerce.number().int().min(1).max(12),
  capacity: z.coerce.number().int().min(1).max(500),
  classTeacherId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const FORM_ID = 'class-form';
const QUERY_KEY = ['academics', 'classes'] as const;

export function ClassesTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'yearLevel', defaultSortOrder: 'asc' });
  const [yearFilter, setYearFilter] = useState<string>(ALL);
  const [editing, setEditing] = useState<ClassRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<ClassRecord>();

  const years = useQuery({
    queryKey: ['academics', 'academic-years', 'all'],
    queryFn: () => academicService.listYears({ limit: 100, sortBy: 'startDate', sortOrder: 'desc' }),
  });

  const departments = useQuery({
    queryKey: ['academics', 'departments', 'all'],
    queryFn: () => academicService.listDepartments({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
    enabled: isFormOpen,
  });

  const courses = useQuery({
    queryKey: ['academics', 'courses', 'all'],
    queryFn: () => academicService.listCourses({ limit: 200, sortBy: 'name', sortOrder: 'asc' }),
    enabled: isFormOpen,
  });

  const teachers = useQuery({
    queryKey: ['teachers', 'options'],
    queryFn: () => teacherService.listOptions(),
    enabled: isFormOpen,
  });

  const params = {
    ...table.queryParams,
    ...(yearFilter !== ALL ? { academicYearId: yearFilter } : {}),
  };

  const query = useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () => academicService.listClasses(params),
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    ClassPayload,
    Partial<ClassPayload>,
    ClassRecord
  >({
    queryKey: QUERY_KEY,
    entityName: 'class',
    create: academicService.createClass,
    update: academicService.updateClass,
    remove: academicService.deleteClass,
    onSuccess: () => setIsFormOpen(false),
  });

  const currentYearId = years.data?.items.find((year) => year.isCurrent)?.id ?? '';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      code: '',
      academicYearId: '',
      departmentId: NONE,
      courseId: NONE,
      yearLevel: 1,
      capacity: 60,
      classTeacherId: NONE,
    },
  });

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            code: editing.code,
            academicYearId: editing.academicYearId,
            departmentId: editing.departmentId ?? NONE,
            courseId: editing.courseId ?? NONE,
            yearLevel: editing.yearLevel,
            capacity: editing.capacity,
            classTeacherId: editing.classTeacherId ?? NONE,
          }
        : {
            name: '',
            code: '',
            academicYearId: currentYearId,
            departmentId: NONE,
            courseId: NONE,
            yearLevel: 1,
            capacity: 60,
            classTeacherId: NONE,
          },
    );
  }, [isFormOpen, editing, form, currentYearId]);

  const onSubmit = async (values: FormValues) => {
    const payload: ClassPayload = {
      name: values.name,
      code: values.code.toUpperCase(),
      academicYearId: values.academicYearId,
      departmentId: values.departmentId === NONE ? null : (values.departmentId ?? null),
      courseId: values.courseId === NONE ? null : (values.courseId ?? null),
      yearLevel: values.yearLevel,
      capacity: values.capacity,
      classTeacherId: values.classTeacherId === NONE ? null : (values.classTeacherId ?? null),
    };

    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, ['name', 'code', 'academicYearId', 'capacity', 'yearLevel']);
    }
  };

  const isFiltered = table.state.search.length > 0 || yearFilter !== ALL;

  const columns: ColumnDef<ClassRecord, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Class',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="text-muted-foreground truncate text-sm">
            {row.original.code} · {row.original.academicYear.name}
          </p>
        </div>
      ),
    },
    {
      id: 'sections',
      header: 'Sections',
      meta: { hideOnMobile: true },
      cell: ({ row }) =>
        row.original.sections.length === 0 ? (
          <span className="text-muted-foreground text-sm">None</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.original.sections.map((section) => (
              <Badge key={section.id} variant="secondary">
                {section.name} · {section._count.students}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      id: 'classTeacher',
      header: 'Class teacher',
      meta: { hideOnMobile: true },
      cell: ({ row }) => {
        const teacher = row.original.classTeacher;
        return teacher ? (
          `${teacher.user.firstName} ${teacher.user.lastName}`
        ) : (
          <span className="text-muted-foreground">Not assigned</span>
        );
      },
    },
    {
      id: 'occupancy',
      header: 'Occupancy',
      cell: ({ row }) => {
        const enrolled = row.original._count.students;
        const capacity = row.original.capacity;
        const percent = capacity > 0 ? Math.min((enrolled / capacity) * 100, 100) : 0;

        return (
          <div className="min-w-28 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="tabular-nums">
                {enrolled}/{capacity}
              </span>
              <span className="text-muted-foreground tabular-nums">{Math.round(percent)}%</span>
            </div>
            <Progress value={percent} className="h-1.5" />
          </div>
        );
      },
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
            searchPlaceholder="Search classes…"
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
                  New class
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={Layers}
            title={isFiltered ? 'No matching classes' : 'No classes yet'}
            description="Classes hold students and are divided into sections."
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit class' : 'New class'}
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Create class'}
        size="lg"
      >
        <Form {...form}>
          <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Grade 10" autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="G10"
                        className="uppercase"
                        onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="departmentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Not assigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Not assigned</SelectItem>
                        {(departments.data?.items ?? []).map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.name}
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
                name="courseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Course</FormLabel>
                    <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Not assigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Not assigned</SelectItem>
                        {(courses.data?.items ?? []).map((course) => (
                          <SelectItem key={course.id} value={course.id}>
                            {course.name}
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
                name="yearLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Year level</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} max={12} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacity</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} max={500} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="classTeacherId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Class teacher</FormLabel>
                  <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Not assigned" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Not assigned</SelectItem>
                      {(teachers.data ?? []).map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.user.firstName} {teacher.user.lastName} · {teacher.employeeId}
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
        title="Delete this class?"
        description={
          <>
            <strong>{deleteTarget.target?.name}</strong> and its sections will be removed. This is
            only possible while no students are enrolled.
          </>
        }
        confirmLabel="Delete class"
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
