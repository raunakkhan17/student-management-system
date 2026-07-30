'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Layers, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
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
import { formatCurrency } from '@/lib/format';
import { applyApiErrors } from '@/lib/form-errors';
import { academicService } from '@/services/academic.service';
import { feeService } from '@/services/fee.service';
import type { FeeStructure, FeeStructurePayload } from '@/types/fee';

const NONE = '__none__';
const FORM_ID = 'fee-structure-form';
const QUERY_KEY = ['fees', 'structures'] as const;

const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  academicYearId: z.string().uuid('Select an academic year'),
  classId: z.string().optional(),
  description: z.string().trim().max(300).optional(),
  isActive: z.boolean(),
  items: z
    .array(
      z.object({
        feeCategoryId: z.string().uuid('Select a category'),
        amount: z.coerce.number().positive('Enter an amount greater than zero'),
        isOptional: z.boolean(),
      }),
    )
    .min(1, 'Add at least one fee line'),
});

type FormValues = z.infer<typeof formSchema>;

export function FeeStructuresTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'name', defaultSortOrder: 'asc' });
  const [editing, setEditing] = useState<FeeStructure | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<FeeStructure>();

  const years = useQuery({
    queryKey: ['academics', 'academic-years', 'all'],
    queryFn: () => academicService.listYears({ limit: 100, sortBy: 'startDate', sortOrder: 'desc' }),
  });

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
    enabled: isFormOpen,
  });

  const categories = useQuery({
    queryKey: ['fees', 'categories', 'all'],
    queryFn: () => feeService.listCategories({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
  });

  const query = useQuery({
    queryKey: [...QUERY_KEY, table.queryParams],
    queryFn: () => feeService.listStructures(table.queryParams),
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    FeeStructurePayload,
    Partial<FeeStructurePayload>,
    FeeStructure
  >({
    queryKey: QUERY_KEY,
    entityName: 'fee structure',
    create: feeService.createStructure,
    update: feeService.updateStructure,
    remove: feeService.deleteStructure,
    onSuccess: () => setIsFormOpen(false),
  });

  const currentYearId = years.data?.items.find((year) => year.isCurrent)?.id ?? '';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      academicYearId: '',
      classId: NONE,
      description: '',
      isActive: true,
      items: [{ feeCategoryId: '', amount: 0, isOptional: false }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
  const watchedItems = form.watch('items');

  const runningTotal = watchedItems.reduce(
    (sum, item) => sum + (item.isOptional ? 0 : Number(item.amount) || 0),
    0,
  );

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            academicYearId: editing.academicYearId,
            classId: editing.classId ?? NONE,
            description: editing.description ?? '',
            isActive: editing.isActive,
            items: editing.items.map((item) => ({
              feeCategoryId: item.feeCategoryId,
              amount: Number(item.amount),
              isOptional: item.isOptional,
            })),
          }
        : {
            name: '',
            academicYearId: currentYearId,
            classId: NONE,
            description: '',
            isActive: true,
            items: [{ feeCategoryId: '', amount: 0, isOptional: false }],
          },
    );
  }, [isFormOpen, editing, form, currentYearId]);

  const onSubmit = async (values: FormValues) => {
    const payload: FeeStructurePayload = {
      name: values.name,
      academicYearId: values.academicYearId,
      classId: values.classId === NONE ? null : (values.classId ?? null),
      isActive: values.isActive,
      ...(values.description ? { description: values.description } : {}),
      items: values.items.map((item) => ({
        feeCategoryId: item.feeCategoryId,
        amount: item.amount,
        isOptional: item.isOptional,
      })),
    };

    try {
      if (editing) {
        // Lines are immutable once invoices exist; omit them in that case.
        const canEditLines = editing._count.invoices === 0;
        await updateMutation.mutateAsync({
          id: editing.id,
          payload: canEditLines ? payload : { ...payload, items: undefined },
        });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, ['name', 'academicYearId', 'items']);
    }
  };

  const columns: ColumnDef<FeeStructure, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Structure',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="text-muted-foreground truncate text-sm">
            {row.original.academicYear.name}
            {row.original.class ? ` · ${row.original.class.name}` : ' · all classes'}
          </p>
        </div>
      ),
    },
    {
      id: 'lines',
      header: 'Lines',
      meta: { hideOnMobile: true },
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.items.slice(0, 3).map((item) => (
            <Badge key={item.id} variant="secondary">
              {item.feeCategory.name}
              {item.isOptional ? ' (opt)' : ''}
            </Badge>
          ))}
          {row.original.items.length > 3 && (
            <Badge variant="outline">+{row.original.items.length - 3}</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'totalAmount',
      header: 'Total',
      meta: { sortKey: 'totalAmount', cellClassName: 'text-right tabular-nums font-medium' },
      cell: ({ row }) => formatCurrency(row.original.totalAmount),
    },
    {
      id: 'invoices',
      header: 'Invoiced',
      meta: { hideOnMobile: true, cellClassName: 'tabular-nums' },
      cell: ({ row }) => row.original._count.invoices,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'ACTIVE' : 'INACTIVE'} />,
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
            {can('FEES', 'EDIT') && (
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
            {can('FEES', 'DELETE') && row.original._count.invoices === 0 && (
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

  const linesAreLocked = editing !== null && editing._count.invoices > 0;

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
            searchPlaceholder="Search fee structures…"
            isFiltered={table.state.search.length > 0}
            onReset={table.reset}
            actions={
              can('FEES', 'CREATE') && (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setIsFormOpen(true);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  New structure
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={Layers}
            title="No fee structures yet"
            description="A fee structure lists what a class is charged. Invoices are generated from it."
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit fee structure' : 'New fee structure'}
        description={
          linesAreLocked
            ? 'Invoices have been issued from this structure, so its lines can no longer change.'
            : 'Optional lines are excluded from automatic billing.'
        }
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Create structure'}
        size="xl"
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
                    <Input {...field} placeholder="Grade 10 — Term 1 fees" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
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
            </div>

            {/* -------------------------------------------------- Fee lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FormLabel>Fee lines</FormLabel>
                <span className="text-sm font-medium tabular-nums">
                  Mandatory total: {formatCurrency(runningTotal)}
                </span>
              </div>

              <div className="space-y-3">
                {fields.map((fieldItem, index) => (
                  <div
                    key={fieldItem.id}
                    className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_9rem_auto_auto] sm:items-end"
                  >
                    <FormField
                      control={form.control}
                      name={`items.${index}.feeCategoryId`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Category</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={linesAreLocked}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select a category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(categories.data?.items ?? [])
                                .filter((category) => category.isActive)
                                .map((category) => (
                                  <SelectItem key={category.id} value={category.id}>
                                    {category.name}
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
                      name={`items.${index}.amount`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Amount</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              min={0}
                              step="0.01"
                              className="tabular-nums"
                              disabled={linesAreLocked}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`items.${index}.isOptional`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-2 space-y-0 pb-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={linesAreLocked}
                              id={`optional-${index}`}
                            />
                          </FormControl>
                          <FormLabel
                            htmlFor={`optional-${index}`}
                            className="cursor-pointer text-xs font-normal whitespace-nowrap"
                          >
                            Optional
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    {fields.length > 1 && !linesAreLocked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive mb-1 size-8"
                        onClick={() => remove(index)}
                        aria-label={`Remove line ${index + 1}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {!linesAreLocked && fields.length < 30 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ feeCategoryId: '', amount: 0, isOptional: false })}
                >
                  <Plus className="size-4" aria-hidden />
                  Add line
                </Button>
              )}
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
                      id="structure-active"
                    />
                  </FormControl>
                  <div className="space-y-1">
                    <FormLabel htmlFor="structure-active" className="cursor-pointer">
                      Active
                    </FormLabel>
                    <FormDescription>
                      Only active structures can be selected when issuing invoices.
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
        title="Delete this fee structure?"
        description={
          <>
            <strong>{deleteTarget.target?.name}</strong> will be removed. This is only possible while
            no invoices have been issued from it.
          </>
        }
        confirmLabel="Delete structure"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget.target) await deleteMutation.mutateAsync(deleteTarget.target.id);
        }}
      />
    </>
  );
}
