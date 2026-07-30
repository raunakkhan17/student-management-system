'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/common/form-dialog';
import { StudentPicker } from '@/components/common/student-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import { formatCurrency } from '@/lib/format';
import { academicService } from '@/services/academic.service';
import { transportService } from '@/services/transport.service';
import type { TransportRoute } from '@/types/transport';

const FORM_ID = 'allocate-transport-form';

const allocateFormSchema = z.object({
  studentId: z.string().uuid('Select a student'),
  stopId: z.string().uuid('Select a stop'),
  academicYearId: z.string().uuid('Select an academic year'),
  startDate: z.string().min(1, 'Choose a start date'),
  endDate: z.string().optional(),
  fare: z.string().trim().optional(),
});

type AllocateFormValues = z.infer<typeof allocateFormSchema>;

interface AllocateTransportDialogProps {
  route: TransportRoute | null;
  onOpenChange: (open: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AllocateTransportDialog({ route, onOpenChange }: AllocateTransportDialogProps) {
  const queryClient = useQueryClient();
  const isOpen = route !== null;

  const years = useQuery({
    queryKey: ['academics', 'years', 'options'],
    queryFn: () => academicService.listYears({ limit: 50, sortBy: 'startDate', sortOrder: 'desc' }),
    select: (page) => page.items,
    enabled: isOpen,
  });

  const form = useForm<AllocateFormValues>({
    resolver: zodResolver(allocateFormSchema),
    defaultValues: {
      studentId: '',
      stopId: '',
      academicYearId: '',
      startDate: today(),
      endDate: '',
      fare: '',
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    const currentYear = years.data?.find((year) => year.isCurrent);
    form.reset({
      studentId: '',
      stopId: '',
      academicYearId: currentYear?.id ?? '',
      startDate: today(),
      endDate: '',
      fare: '',
    });
  }, [isOpen, years.data, form]);

  const mutation = useMutation({
    mutationFn: (values: AllocateFormValues) => {
      if (!route) throw new Error('No route selected');
      const fare = values.fare?.trim() ? Number(values.fare) : undefined;

      return transportService.allocate({
        studentId: values.studentId,
        routeId: route.id,
        stopId: values.stopId,
        academicYearId: values.academicYearId,
        startDate: values.startDate,
        ...(values.endDate ? { endDate: values.endDate } : {}),
        ...(fare !== undefined && Number.isFinite(fare) ? { fare } : {}),
      });
    },
    onSuccess: async (allocation) => {
      toast.success(
        `${allocation.student.user.firstName} ${allocation.student.user.lastName} assigned to ${allocation.route.name} at ${allocation.stop.name}`,
      );
      await queryClient.invalidateQueries({ queryKey: ['transport'] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not assign transport');
    },
  });

  const onSubmit = async (values: AllocateFormValues) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'studentId',
        'stopId',
        'academicYearId',
        'startDate',
        'endDate',
        'fare',
      ]);
    }
  };

  const capacity = route?.vehicle?.capacity ?? 0;
  const riders = route?._count.allocations ?? 0;
  const seatsLeft = capacity > 0 ? capacity - riders : null;

  return (
    <FormDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title="Assign transport"
      description={
        route
          ? `${route.name} (${route.code}) — standard fare ${formatCurrency(route.fare)}${
              seatsLeft === null ? '' : `, ${seatsLeft} seat(s) left`
            }.`
          : undefined
      }
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Assign transport"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {seatsLeft !== null && seatsLeft <= 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                This route is at vehicle capacity. Assign a larger vehicle or end an existing
                allocation first.
              </AlertDescription>
            </Alert>
          )}

          {route && route.vehicle === null && (
            <Alert>
              <AlertDescription>
                No vehicle is assigned to this route yet, so seat capacity is not enforced.
              </AlertDescription>
            </Alert>
          )}

          <FormField
            control={form.control}
            name="studentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Student</FormLabel>
                <FormControl>
                  <StudentPicker
                    value={field.value || null}
                    onChange={(id) => field.onChange(id ?? '')}
                  />
                </FormControl>
                <FormDescription>
                  One transport allocation per student per academic year.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="stopId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Boarding stop</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a stop" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(route?.stops ?? []).map((stop) => (
                      <SelectItem key={stop.id} value={stop.id}>
                        {stop.sequence}. {stop.name} · {stop.pickupTime} / {stop.dropTime}
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
                      <SelectValue placeholder="Select a year" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(years.data ?? []).map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name}
                        {year.isCurrent ? ' · current' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>From</FormLabel>
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
                  <FormLabel>Until</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fare"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fare</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="decimal" placeholder="Route fare" />
                  </FormControl>
                  <FormDescription>Override only if agreed.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </form>
      </Form>
    </FormDialog>
  );
}
