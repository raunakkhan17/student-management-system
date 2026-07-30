'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Grid3x3, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
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
  FormDescription,
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
import type { Section, SectionPayload } from '@/types/academic';

const ALL = '__all__';
const NONE = '__none__';

const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(20),
  classId: z.string().uuid('Select a class'),
  capacity: z.coerce.number().int().min(1).max(200),
  classTeacherId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const FORM_ID = 'section-form';
const QUERY_KEY = ['academics', 'sections'] as const;

export function SectionsTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'name', defaultSortOrder: 'asc' });
  const [classFilter, setClassFilter] = useState<string>(ALL);
  const [editing, setEditing] = useState<Section | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<Section>();

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
  });

  const teachers = useQuery({
    queryKey: ['teachers', 'options'],
    queryFn: () => teacherService.listOptions(),
    enabled: isFormOpen,
  });

  const params = {
    ...table.queryParams,
    ...(classFilter !== ALL ? { classId: classFilter } : {}),
  };

  const query = useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () => academicService.listSections(params),
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    SectionPayload,
    Partial<Omit<SectionPayload, 'classId'>>,
    Section
  >({
    queryKey: QUERY_KEY,
    entityName: 'section',
    create: academicService.createSection,
    update: academicService.updateSection,
    remove: academicService.deleteSection,
    onSuccess: () => setIsFormOpen(false),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', classId: '', capacity: 40, classTeacherId: NONE },
  });

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            classId: editing.classId,
            capacity: editing.capacity,
            classTeacherId: editing.classTeacherId ?? NONE,
          }
        : {
            name: '',
            classId: classFilter !== ALL ? classFilter : '',
            capacity: 40,
            classTeacherId: NONE,
          },
    );
  }, [isFormOpen, editing, form, classFilter]);

  const onSubmit = async (values: FormValues) => {
    const classTeacherId = values.classTeacherId === NONE ? null : (values.classTeacherId ?? null);

    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          payload: { name: values.name, capacity: values.capacity, classTeacherId },
        });
      } else {
        await createMutation.mutateAsync({
          name: values.name,
          classId: values.classId,
          capacity: values.capacity,
          classTeacherId,
        });
      }
    } catch (error) {
      applyApiErrors(error, form.setError, ['name', 'classId', 'capacity', 'classTeacherId']);
    }
  };

  const isFiltered = table.state.search.length > 0 || classFilter !== ALL;

  const columns: ColumnDef<Section, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Section',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">
            {row.original.class.name} — {row.original.name}
          </p>
          <p className="text-muted-foreground truncate text-sm">
            {row.original.class.academicYear.name}
          </p>
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
      id: 'room',
      header: 'Room',
      meta: { hideOnMobile: true },
      cell: ({ row }) =>
        row.original.room?.name ?? <span className="text-muted-foreground">—</span>,
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
            searchPlaceholder="Search sections…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setClassFilter(ALL);
            }}
            filters={
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-[11rem]" aria-label="Filter by class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All classes</SelectItem>
                  {(classOptions.data ?? []).map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            actions={
              can('ACADEMICS', 'CREATE') && (
                <Button onClick={() => { setEditing(null); setIsFormOpen(true); }}>
                  <Plus className="size-4" aria-hidden />
                  New section
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={Grid3x3}
            title={isFiltered ? 'No matching sections' : 'No sections yet'}
            description="Sections split a class into groups that attendance and timetables are set against."
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit section' : 'New section'}
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Create section'}
      >
        <Form {...form}>
          <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <FormField
              control={form.control}
              name="classId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Class</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={editing !== null}
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
                  {editing && (
                    <FormDescription>
                      A section cannot be moved to a different class.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="A" autoFocus />
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
                      <Input {...field} type="number" min={1} max={200} />
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
        title="Delete this section?"
        description={
          <>
            <strong>
              {deleteTarget.target?.class.name} — {deleteTarget.target?.name}
            </strong>{' '}
            will be removed. This is only possible while no students are assigned to it.
          </>
        }
        confirmLabel="Delete section"
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
