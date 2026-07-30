'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Building2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { academicService } from '@/services/academic.service';
import { teacherService } from '@/services/teacher.service';
import type { Department, DepartmentPayload } from '@/types/academic';

const NONE = '__none__';

const departmentFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and dashes only'),
  description: z.string().trim().max(500).optional(),
  headTeacherId: z.string().optional(),
});

type DepartmentFormValues = z.infer<typeof departmentFormSchema>;

const FORM_ID = 'department-form';
const QUERY_KEY = ['academics', 'departments'] as const;

export function DepartmentsTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'name', defaultSortOrder: 'asc' });
  const [editing, setEditing] = useState<Department | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<Department>();

  const query = useQuery({
    queryKey: [...QUERY_KEY, table.queryParams],
    queryFn: () => academicService.listDepartments(table.queryParams),
  });

  // Only fetched when the form is open — heads of department are rarely edited.
  const teacherOptions = useQuery({
    queryKey: ['teachers', 'options'],
    queryFn: () => teacherService.listOptions(),
    enabled: isFormOpen,
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    DepartmentPayload,
    Partial<DepartmentPayload>,
    Department
  >({
    queryKey: QUERY_KEY,
    entityName: 'department',
    create: academicService.createDepartment,
    update: academicService.updateDepartment,
    remove: academicService.deleteDepartment,
    onSuccess: () => setIsFormOpen(false),
  });

  const form = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentFormSchema),
    defaultValues: { name: '', code: '', description: '', headTeacherId: NONE },
  });

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            code: editing.code,
            description: editing.description ?? '',
            headTeacherId: editing.headTeacherId ?? NONE,
          }
        : { name: '', code: '', description: '', headTeacherId: NONE },
    );
  }, [isFormOpen, editing, form]);

  const onSubmit = async (values: DepartmentFormValues) => {
    const payload: DepartmentPayload = {
      name: values.name,
      code: values.code.toUpperCase(),
      headTeacherId: values.headTeacherId === NONE ? null : (values.headTeacherId ?? null),
      ...(values.description ? { description: values.description } : {}),
    };

    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, ['name', 'code', 'description', 'headTeacherId']);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const openEdit = (department: Department) => {
    setEditing(department);
    setIsFormOpen(true);
  };

  const columns: ColumnDef<Department, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Department',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="text-muted-foreground truncate text-sm">{row.original.code}</p>
        </div>
      ),
    },
    {
      id: 'headTeacher',
      header: 'Head of department',
      meta: { hideOnMobile: true },
      cell: ({ row }) => {
        const head = row.original.headTeacher;
        return head ? (
          <span>
            {head.user.firstName} {head.user.lastName}
          </span>
        ) : (
          <span className="text-muted-foreground">Not assigned</span>
        );
      },
    },
    {
      id: 'usage',
      header: 'In use by',
      meta: { hideOnMobile: true },
      cell: ({ row }) => {
        const { courses, classes, subjects, teachers } = row.original._count;
        return (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{courses} courses</Badge>
            <Badge variant="secondary">{classes} classes</Badge>
            <Badge variant="secondary">{subjects} subjects</Badge>
            <Badge variant="secondary">{teachers} staff</Badge>
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
              <DropdownMenuItem onClick={() => openEdit(row.original)}>
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
            searchPlaceholder="Search departments…"
            isFiltered={table.state.search.length > 0}
            onReset={table.reset}
            actions={
              can('ACADEMICS', 'CREATE') && (
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  New department
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={Building2}
            title={table.state.search ? 'No matching departments' : 'No departments yet'}
            description={
              table.state.search
                ? 'Try a different search term.'
                : 'Departments group your courses, classes, subjects and staff.'
            }
            action={
              !table.state.search &&
              can('ACADEMICS', 'CREATE') && (
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  New department
                </Button>
              )
            }
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit department' : 'New department'}
        description={
          editing
            ? 'Update the department details.'
            : 'Departments group courses, classes, subjects and staff.'
        }
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Create department'}
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
                    <Input {...field} placeholder="Computer Science" autoFocus />
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
                      placeholder="CSE"
                      className="uppercase"
                      onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormDescription>A short unique identifier, e.g. CSE or MECH.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="headTeacherId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Head of department</FormLabel>
                  <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Not assigned" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Not assigned</SelectItem>
                      {(teacherOptions.data ?? []).map((teacher) => (
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

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Optional notes about this department" />
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
        title="Delete this department?"
        description={
          <>
            <strong>{deleteTarget.target?.name}</strong> will be removed. This is only possible while
            no courses, classes, subjects or staff are attached to it.
          </>
        }
        confirmLabel="Delete department"
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
