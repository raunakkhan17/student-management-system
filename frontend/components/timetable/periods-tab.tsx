'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Clock, Coffee, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { FormDialog } from '@/components/common/form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { useCrudMutations } from '@/hooks/use-crud-mutations';
import { applyApiErrors } from '@/lib/form-errors';
import { timetableService } from '@/services/timetable.service';
import type { PeriodPayload, TimetablePeriod } from '@/types/timetable';

const FORM_ID = 'period-form';
const QUERY_KEY = ['timetable', 'periods'] as const;

const formSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(50),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the 24-hour format HH:MM'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the 24-hour format HH:MM'),
    sortOrder: z.coerce.number().int().min(1).max(50),
    isBreak: z.boolean(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'The end time must be after the start time',
    path: ['endTime'],
  });

type FormValues = z.infer<typeof formSchema>;

export function PeriodsTab() {
  const { can } = useAuth();
  const [editing, setEditing] = useState<TimetablePeriod | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<TimetablePeriod>();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => timetableService.listPeriods(),
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    PeriodPayload,
    Partial<PeriodPayload>,
    TimetablePeriod
  >({
    queryKey: QUERY_KEY,
    entityName: 'period',
    create: timetableService.createPeriod,
    update: timetableService.updatePeriod,
    remove: timetableService.deletePeriod,
    onSuccess: () => setIsFormOpen(false),
  });

  const periods = query.data ?? [];
  const nextSortOrder = periods.length === 0 ? 1 : Math.max(...periods.map((p) => p.sortOrder)) + 1;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', startTime: '09:00', endTime: '09:45', sortOrder: 1, isBreak: false },
  });

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            startTime: editing.startTime,
            endTime: editing.endTime,
            sortOrder: editing.sortOrder,
            isBreak: editing.isBreak,
          }
        : {
            name: `Period ${nextSortOrder}`,
            startTime: '09:00',
            endTime: '09:45',
            sortOrder: nextSortOrder,
            isBreak: false,
          },
    );
  }, [isFormOpen, editing, form, nextSortOrder]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, payload: values });
      } else {
        await createMutation.mutateAsync(values);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, ['name', 'startTime', 'endTime', 'sortOrder']);
    }
  };

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (query.error) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        {can('TIMETABLE', 'CREATE') && (
          <Button
            onClick={() => {
              setEditing(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add period
          </Button>
        )}
      </div>

      <Card>
        <CardContent className={periods.length === 0 ? 'p-0' : 'p-0'}>
          {periods.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No periods defined"
              description="Periods are the rows of every timetable and the slots attendance is marked against."
            />
          ) : (
            <ul className="divide-y">
              {periods.map((period) => (
                <li key={period.id} className="flex items-center gap-4 p-4">
                  <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg text-sm font-semibold tabular-nums">
                    {period.sortOrder}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{period.name}</p>
                      {period.isBreak && (
                        <Badge variant="secondary">
                          <Coffee className="size-3" aria-hidden />
                          Break
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-sm tabular-nums">
                      {period.startTime} – {period.endTime}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8" aria-label="Period actions">
                        <MoreHorizontal className="size-4" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {can('TIMETABLE', 'EDIT') && (
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(period);
                            setIsFormOpen(true);
                          }}
                        >
                          <Pencil className="size-4" aria-hidden />
                          Edit
                        </DropdownMenuItem>
                      )}
                      {can('TIMETABLE', 'DELETE') && (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => deleteTarget.open(period)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit period' : 'Add a period'}
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Add period'}
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
                    <Input {...field} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start time</FormLabel>
                    <FormControl>
                      <Input {...field} type="time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End time</FormLabel>
                    <FormControl>
                      <Input {...field} type="time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} max={50} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isBreak"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-lg border p-4">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} id="is-break" />
                  </FormControl>
                  <div className="space-y-1">
                    <FormLabel htmlFor="is-break" className="cursor-pointer">
                      This is a break
                    </FormLabel>
                    <FormDescription>
                      Breaks span every day and cannot hold a subject.
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
        title="Delete this period?"
        description={
          <>
            <strong>{deleteTarget.target?.name}</strong> will be removed. This is only possible while
            no timetable slots or attendance sessions reference it.
          </>
        }
        confirmLabel="Delete period"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget.target) await deleteMutation.mutateAsync(deleteTarget.target.id);
        }}
      />
    </>
  );
}
