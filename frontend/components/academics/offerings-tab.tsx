'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Link2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
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
import type { OfferingPayload, SubjectOffering } from '@/types/academic';

const ALL = '__all__';
const NONE = '__none__';

const formSchema = z.object({
  classId: z.string().uuid('Select a class'),
  sectionId: z.string().optional(),
  subjectId: z.string().uuid('Select a subject'),
  semesterId: z.string().optional(),
  teacherId: z.string().optional(),
  isElective: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

const FORM_ID = 'offering-form';
const QUERY_KEY = ['academics', 'offerings'] as const;

/** Maps a subject to a class (and optionally a section) with a teacher. */
export function OfferingsTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'subject', defaultSortOrder: 'asc' });
  const [classFilter, setClassFilter] = useState<string>(ALL);
  const [editing, setEditing] = useState<SubjectOffering | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<SubjectOffering>();

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
  });

  const subjects = useQuery({
    queryKey: ['academics', 'subjects', 'options'],
    queryFn: () => academicService.listSubjectOptions(),
    enabled: isFormOpen,
  });

  const semesters = useQuery({
    queryKey: ['academics', 'semesters', 'all'],
    queryFn: () => academicService.listSemesters({ limit: 100, sortBy: 'startDate', sortOrder: 'asc' }),
    enabled: isFormOpen,
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
    queryFn: () => academicService.listOfferings(params),
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    OfferingPayload,
    Partial<Pick<OfferingPayload, 'teacherId' | 'semesterId' | 'isElective'>>,
    SubjectOffering
  >({
    queryKey: QUERY_KEY,
    entityName: 'subject offering',
    create: academicService.createOffering,
    update: academicService.updateOffering,
    remove: academicService.deleteOffering,
    onSuccess: () => setIsFormOpen(false),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      classId: '',
      sectionId: NONE,
      subjectId: '',
      semesterId: NONE,
      teacherId: NONE,
      isElective: false,
    },
  });

  const selectedClassId = form.watch('classId');

  // Section choices depend on the selected class.
  const sectionChoices = useMemo(
    () => classOptions.data?.find((option) => option.id === selectedClassId)?.sections ?? [],
    [classOptions.data, selectedClassId],
  );

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            classId: editing.classId,
            sectionId: editing.sectionId ?? NONE,
            subjectId: editing.subjectId,
            semesterId: editing.semesterId ?? NONE,
            teacherId: editing.teacherId ?? NONE,
            isElective: editing.isElective,
          }
        : {
            classId: classFilter !== ALL ? classFilter : '',
            sectionId: NONE,
            subjectId: '',
            semesterId: NONE,
            teacherId: NONE,
            isElective: false,
          },
    );
  }, [isFormOpen, editing, form, classFilter]);

  const onSubmit = async (values: FormValues) => {
    const teacherId = values.teacherId === NONE ? null : (values.teacherId ?? null);
    const semesterId = values.semesterId === NONE ? null : (values.semesterId ?? null);

    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          payload: { teacherId, semesterId, isElective: values.isElective },
        });
      } else {
        await createMutation.mutateAsync({
          classId: values.classId,
          sectionId: values.sectionId === NONE ? null : (values.sectionId ?? null),
          subjectId: values.subjectId,
          semesterId,
          teacherId,
          isElective: values.isElective,
        });
      }
    } catch (error) {
      applyApiErrors(error, form.setError, ['classId', 'sectionId', 'subjectId', 'teacherId']);
    }
  };

  const isFiltered = table.state.search.length > 0 || classFilter !== ALL;

  const columns: ColumnDef<SubjectOffering, unknown>[] = [
    {
      id: 'subject',
      header: 'Subject',
      meta: { sortKey: 'subject' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{row.original.subject.name}</span>
            {row.original.isElective && <Badge variant="secondary">Elective</Badge>}
          </div>
          <p className="text-muted-foreground truncate text-sm">{row.original.subject.code}</p>
        </div>
      ),
    },
    {
      id: 'target',
      header: 'Taught to',
      cell: ({ row }) => (
        <span>
          {row.original.class.name}
          {row.original.section ? ` — ${row.original.section.name}` : ' (all sections)'}
        </span>
      ),
    },
    {
      id: 'teacher',
      header: 'Teacher',
      meta: { hideOnMobile: true },
      cell: ({ row }) => {
        const teacher = row.original.teacher;
        return teacher ? (
          `${teacher.user.firstName} ${teacher.user.lastName}`
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        );
      },
    },
    {
      id: 'semester',
      header: 'Semester',
      meta: { hideOnMobile: true },
      cell: ({ row }) =>
        row.original.semester?.name ?? <span className="text-muted-foreground">Full year</span>,
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
                Remove
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
            searchPlaceholder="Search by subject…"
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
              can('ACADEMICS', 'ASSIGN') && (
                <Button onClick={() => { setEditing(null); setIsFormOpen(true); }}>
                  <Plus className="size-4" aria-hidden />
                  Assign subject
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={Link2}
            title={isFiltered ? 'No matching offerings' : 'No subjects assigned yet'}
            description="Assign subjects to classes so teachers, timetables and exams have something to work with."
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit subject offering' : 'Assign a subject'}
        description="Leave the section blank to offer the subject to every section of the class."
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Assign subject'}
        size="lg"
      >
        <Form {...form}>
          <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
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
                        // The previous section belongs to a different class.
                        form.setValue('sectionId', NONE);
                      }}
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
                      value={field.value ?? NONE}
                      onValueChange={field.onChange}
                      disabled={editing !== null || !selectedClassId}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="All sections" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>All sections</SelectItem>
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
            </div>

            <FormField
              control={form.control}
              name="subjectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={editing !== null}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a subject" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(subjects.data ?? []).map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name} ({subject.code})
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
                name="teacherId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teacher</FormLabel>
                    <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {(teachers.data ?? []).map((teacher) => (
                          <SelectItem key={teacher.id} value={teacher.id}>
                            {teacher.user.firstName} {teacher.user.lastName}
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
                            {semester.name} · {semester.academicYear.name}
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
              name="isElective"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-lg border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      id="isElective"
                    />
                  </FormControl>
                  <div className="space-y-1">
                    <FormLabel htmlFor="isElective" className="cursor-pointer">
                      This is an elective
                    </FormLabel>
                    <FormDescription>
                      Students choose electives individually rather than being enrolled automatically.
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
        title="Remove this subject offering?"
        description={
          <>
            <strong>{deleteTarget.target?.subject.name}</strong> will no longer be offered to{' '}
            <strong>{deleteTarget.target?.class.name}</strong>. Timetable slots referencing it are
            cleared.
          </>
        }
        confirmLabel="Remove offering"
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
