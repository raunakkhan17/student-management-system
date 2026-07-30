'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/common/form-dialog';
import { UserPicker } from '@/components/common/user-picker';
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
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import { leaveService } from '@/services/leave.service';
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/types/leave';

const FORM_ID = 'apply-leave-form';

const LEAVE_TYPES: LeaveType[] = [
  'SICK',
  'CASUAL',
  'EMERGENCY',
  'VACATION',
  'MATERNITY',
  'UNPAID',
  'OTHER',
];

const applyFormSchema = z
  .object({
    applicantId: z.string().optional(),
    type: z.enum(['SICK', 'CASUAL', 'EMERGENCY', 'VACATION', 'MATERNITY', 'UNPAID', 'OTHER']),
    fromDate: z.string().min(1, 'Choose a start date'),
    toDate: z.string().min(1, 'Choose an end date'),
    totalDays: z.string().trim().optional(),
    reason: z.string().trim().min(1, 'A reason is required').max(1000),
  })
  .refine((data) => data.toDate >= data.fromDate, {
    message: 'The end date must not be before the start date',
    path: ['toDate'],
  });

type ApplyFormValues = z.infer<typeof applyFormSchema>;

interface ApplyLeaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Whole days between two ISO dates, inclusive. */
function spanInDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const start = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function ApplyLeaveDialog({ open, onOpenChange }: ApplyLeaveDialogProps) {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();

  // Only administrators may raise leave on someone else's behalf.
  const canApplyForOthers = hasRole('SUPER_ADMIN', 'ADMIN');

  const form = useForm<ApplyFormValues>({
    resolver: zodResolver(applyFormSchema),
    defaultValues: {
      applicantId: '',
      type: 'CASUAL',
      fromDate: today(),
      toDate: today(),
      totalDays: '',
      reason: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      applicantId: '',
      type: 'CASUAL',
      fromDate: today(),
      toDate: today(),
      totalDays: '',
      reason: '',
    });
  }, [open, form]);

  const mutation = useMutation({
    mutationFn: (values: ApplyFormValues) => {
      const totalDays = values.totalDays?.trim() ? Number(values.totalDays) : undefined;

      return leaveService.apply({
        type: values.type,
        fromDate: values.fromDate,
        toDate: values.toDate,
        reason: values.reason,
        ...(values.applicantId ? { applicantId: values.applicantId } : {}),
        ...(totalDays !== undefined && Number.isFinite(totalDays) ? { totalDays } : {}),
      });
    },
    onSuccess: async () => {
      toast.success('Leave request submitted for approval');
      await queryClient.invalidateQueries({ queryKey: ['leave'] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not submit the request');
    },
  });

  const onSubmit = async (values: ApplyFormValues) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'applicantId',
        'type',
        'fromDate',
        'toDate',
        'totalDays',
        'reason',
      ]);
    }
  };

  const span = spanInDays(form.watch('fromDate'), form.watch('toDate'));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Apply for leave"
      description="Requests go to an administrator for approval."
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Submit request"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {canApplyForOthers && (
            <FormField
              control={form.control}
              name="applicantId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>On behalf of</FormLabel>
                  <FormControl>
                    <UserPicker
                      value={field.value || null}
                      onChange={(id) => field.onChange(id ?? '')}
                      clearable
                      clearLabel="Myself"
                      placeholder="Myself"
                    />
                  </FormControl>
                  <FormDescription>Leave blank to apply for yourself.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Leave type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {LEAVE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {LEAVE_TYPE_LABELS[type]}
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
              name="fromDate"
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
              name="toDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>To</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="totalDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Days</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="decimal" placeholder={String(span || '')} />
                  </FormControl>
                  <FormDescription>
                    {span > 0 ? `${span} by default; enter 0.5 for a half day.` : 'Half days allowed.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reason</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={4} placeholder="Why is the leave needed?" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FormDialog>
  );
}
