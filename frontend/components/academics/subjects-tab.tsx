'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { BookOpen, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
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
import {
  SUBJECT_TYPE_LABELS,
  type Subject,
  type SubjectPayload,
  type SubjectType,
} from '@/types/academic';

const NONE = '__none__';
const ALL = '__all__';
const TYPES: SubjectType[] = ['CORE', 'ELECTIVE', 'PRACTICAL', 'LANGUAGE', 'ACTIVITY'];

const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and dashes only'),
  departmentId: z.string().optional(),
  type: z.enum(['CORE', 'ELECTIVE', 'PRACTICAL', 'LANGUAGE', 'ACTIVITY']),
  credits: z.coerce.number().int().min(0).max(20),
  description: z.string().trim().max(500).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const FORM_ID = 'subject-form';
const QUERY_KEY = ['academics', 'subjects'] as const;

export function SubjectsTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'name', defaultSortOrder: 'asc' });
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [departmentFilter, setDepartmentFilter] = useState<string>(ALL);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<Subject>();

  const departments = useQuery({
    queryKey: ['academics', 'departments', 'all'],
    queryFn: () => academicService.listDepartments({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
  });

  const params = {
    ...table.queryParams,
    ...(typeFilter !== ALL ? { type: typeFilter as SubjectType } : {}),
    ...(departmentFilter !== ALL ? { departmentId: departmentFilter } : {}),
  };

  const query = useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () => academicService.listSubjects(params),
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    SubjectPayload,
    Partial<SubjectPayload>,
    Subject
  >({
    queryKey: QUERY_KEY,
    entityName: 'subject',
    create: academicService.createSubject,
    update: academicService.updateSubject,
    remove: academicService.deleteSubject,
    onSuccess: () => setIsFormOpen(false),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', code: '', departmentId: NONE, type: 'CORE', credits: 0, description: '' },
  });

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            code: editing.code,
            departmentId: editing.departmentId ?? NONE,
            type: editing.type,
            credits: editing.credits,
            description: editing.description ?? '',
          }
        : { name: '', code: '', departmentId: NONE, type: 'CORE', credits: 0, description: '' },
    );
  }, [isFormOpen, editing, form]);

  const onSubmit = async (values: FormValues) => {
    const payload: SubjectPayload = {
      name: values.name,
      code: values.code.toUpperCase(),
      departmentId: values.departmentId === NONE ? null : (values.departmentId ?? null),
      type: values.type,
      credits: values.credits,
      ...(values.description ? { description: values.description } : {}),
    };

    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, ['name', 'code', 'departmentId', 'type', 'credits']);
    }
  };

  const isFiltered = table.state.search.length > 0 || typeFilter !== ALL || departmentFilter !== ALL;

  const columns: ColumnDef<Subject, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Subject',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="text-muted-foreground truncate text-sm">{row.original.code}</p>
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Type',
      meta: { sortKey: 'type' },
      cell: ({ row }) => <Badge variant="secondary">{SUBJECT_TYPE_LABELS[row.original.type]}</Badge>,
    },
    {
      id: 'department',
      header: 'Department',
      meta: { hideOnMobile: true },
      cell: ({ row }) =>
        row.original.department?.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'credits',
      header: 'Credits',
      meta: { sortKey: 'credits', hideOnMobile: true, cellClassName: 'tabular-nums' },
      cell: ({ row }) => row.original.credits,
    },
    {
      id: 'offerings',
      header: 'Offered in',
      meta: { hideOnMobile: true },
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original._count.classSubjects} class
          {row.original._count.classSubjects === 1 ? '' : 'es'}
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
            searchPlaceholder="Search subjects…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setTypeFilter(ALL);
              setDepartmentFilter(ALL);
            }}
            filters={
              <>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[9.5rem]" aria-label="Filter by type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All types</SelectItem>
                    {TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {SUBJECT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

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
              </>
            }
            actions={
              can('ACADEMICS', 'CREATE') && (
                <Button onClick={() => { setEditing(null); setIsFormOpen(true); }}>
                  <Plus className="size-4" aria-hidden />
                  New subject
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={BookOpen}
            title={isFiltered ? 'No matching subjects' : 'No subjects yet'}
            description={
              isFiltered
                ? 'Try clearing the filters.'
                : 'Subjects are taught to classes through subject offerings.'
            }
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit subject' : 'New subject'}
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Create subject'}
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
                    <Input {...field} placeholder="Data Structures" autoFocus />
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
                        placeholder="CS-201"
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
                name="credits"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credits</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={0} max={20} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                        {TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {SUBJECT_TYPE_LABELS[type]}
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
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Optional syllabus summary" />
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
        title="Delete this subject?"
        description={
          <>
            <strong>{deleteTarget.target?.name}</strong> will be removed. This is only possible while
            it is not offered to any class.
          </>
        }
        confirmLabel="Delete subject"
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
