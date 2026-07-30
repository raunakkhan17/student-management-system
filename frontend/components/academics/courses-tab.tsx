'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { GraduationCap, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
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
import { academicService } from '@/services/academic.service';
import type { Course, CoursePayload } from '@/types/academic';

const ALL = '__all__';

const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and dashes only'),
  departmentId: z.string().uuid('Select a department'),
  durationYears: z.coerce.number().int().min(1).max(10),
  description: z.string().trim().max(500).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const FORM_ID = 'course-form';
const QUERY_KEY = ['academics', 'courses'] as const;

export function CoursesTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'name', defaultSortOrder: 'asc' });
  const [departmentFilter, setDepartmentFilter] = useState<string>(ALL);
  const [editing, setEditing] = useState<Course | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<Course>();

  const departments = useQuery({
    queryKey: ['academics', 'departments', 'all'],
    queryFn: () => academicService.listDepartments({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
  });

  const params = {
    ...table.queryParams,
    ...(departmentFilter !== ALL ? { departmentId: departmentFilter } : {}),
  };

  const query = useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () => academicService.listCourses(params),
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    CoursePayload,
    Partial<CoursePayload>,
    Course
  >({
    queryKey: QUERY_KEY,
    entityName: 'course',
    create: academicService.createCourse,
    update: academicService.updateCourse,
    remove: academicService.deleteCourse,
    onSuccess: () => setIsFormOpen(false),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', code: '', departmentId: '', durationYears: 1, description: '' },
  });

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            code: editing.code,
            departmentId: editing.departmentId,
            durationYears: editing.durationYears,
            description: editing.description ?? '',
          }
        : { name: '', code: '', departmentId: '', durationYears: 1, description: '' },
    );
  }, [isFormOpen, editing, form]);

  const onSubmit = async (values: FormValues) => {
    const payload: CoursePayload = {
      name: values.name,
      code: values.code.toUpperCase(),
      departmentId: values.departmentId,
      durationYears: values.durationYears,
      ...(values.description ? { description: values.description } : {}),
    };

    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, ['name', 'code', 'departmentId', 'durationYears']);
    }
  };

  const isFiltered = table.state.search.length > 0 || departmentFilter !== ALL;

  const columns: ColumnDef<Course, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Course',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="text-muted-foreground truncate text-sm">{row.original.code}</p>
        </div>
      ),
    },
    {
      id: 'department',
      header: 'Department',
      meta: { hideOnMobile: true },
      cell: ({ row }) => row.original.department.name,
    },
    {
      accessorKey: 'durationYears',
      header: 'Duration',
      meta: { sortKey: 'durationYears', hideOnMobile: true },
      cell: ({ row }) => `${row.original.durationYears} year${row.original.durationYears === 1 ? '' : 's'}`,
    },
    {
      id: 'classes',
      header: 'Classes',
      meta: { hideOnMobile: true, cellClassName: 'tabular-nums' },
      cell: ({ row }) => row.original._count.classes,
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
            searchPlaceholder="Search courses…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setDepartmentFilter(ALL);
            }}
            filters={
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-[11rem]" aria-label="Filter by department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All departments</SelectItem>
                  {(departments.data?.items ?? []).map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            actions={
              can('ACADEMICS', 'CREATE') && (
                <Button onClick={() => { setEditing(null); setIsFormOpen(true); }}>
                  <Plus className="size-4" aria-hidden />
                  New course
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={GraduationCap}
            title={isFiltered ? 'No matching courses' : 'No courses yet'}
            description={
              isFiltered
                ? 'Try clearing the filters.'
                : 'Courses are multi-year programmes that classes belong to.'
            }
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit course' : 'New course'}
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Create course'}
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
                    <Input {...field} placeholder="B.Sc. Computer Science" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="BSC-CS"
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
                name="durationYears"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (years)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} max={10} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="departmentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a department" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Optional programme summary" />
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
        title="Delete this course?"
        description={
          <>
            <strong>{deleteTarget.target?.name}</strong> will be removed. This is only possible while
            no classes belong to it.
          </>
        }
        confirmLabel="Delete course"
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
