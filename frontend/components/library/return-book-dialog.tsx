'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/common/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import { formatCurrency, formatDate } from '@/lib/format';
import { libraryService } from '@/services/library.service';
import {
  BOOK_CONDITION_LABELS,
  type BookCondition,
  type BookTransaction,
} from '@/types/library';

const FORM_ID = 'return-book-form';
const CONDITIONS: BookCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR'];

const returnFormSchema = z.object({
  markAsLost: z.boolean(),
  condition: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR']),
  waiveFine: z.boolean(),
  remarks: z.string().trim().max(300).optional(),
});

type ReturnFormValues = z.infer<typeof returnFormSchema>;

interface ReturnBookDialogProps {
  loan: BookTransaction | null;
  onOpenChange: (open: boolean) => void;
}

/** Days a loan is past due, floored at zero — mirrors the server calculation. */
function daysOverdue(dueDate: string): number {
  const due = new Date(dueDate);
  due.setUTCHours(23, 59, 59, 999);
  const now = Date.now();
  if (now <= due.getTime()) return 0;
  return Math.floor((now - due.getTime()) / 86_400_000) + 1;
}

export function ReturnBookDialog({ loan, onOpenChange }: ReturnBookDialogProps) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const isOpen = loan !== null;

  const settings = useQuery({
    queryKey: ['library', 'settings'],
    queryFn: () => libraryService.getSettings(),
    enabled: isOpen,
  });

  const form = useForm<ReturnFormValues>({
    resolver: zodResolver(returnFormSchema),
    defaultValues: { markAsLost: false, condition: 'GOOD', waiveFine: false, remarks: '' },
  });

  useEffect(() => {
    if (!isOpen || !loan) return;
    form.reset({
      markAsLost: false,
      condition: loan.bookCopy.condition,
      waiveFine: false,
      remarks: '',
    });
  }, [isOpen, loan, form]);

  const mutation = useMutation({
    mutationFn: (values: ReturnFormValues) => {
      if (!loan) throw new Error('No loan selected');
      return libraryService.returnBook(loan.id, {
        markAsLost: values.markAsLost,
        condition: values.condition,
        waiveFine: values.waiveFine,
        ...(values.remarks ? { remarks: values.remarks } : {}),
      });
    },
    onSuccess: async (updated) => {
      const fine = Number(updated.fineAmount);
      toast.success(
        fine > 0
          ? `Recorded — fine of ${formatCurrency(updated.fineAmount)} outstanding`
          : 'Returned successfully',
      );
      await queryClient.invalidateQueries({ queryKey: ['library'] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not record the return');
    },
  });

  const onSubmit = async (values: ReturnFormValues) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, ['markAsLost', 'condition', 'waiveFine', 'remarks']);
    }
  };

  const markAsLost = form.watch('markAsLost');
  const overdueDays = loan ? daysOverdue(loan.dueDate) : 0;
  const finePerDay = settings.data?.finePerDay ?? 0;
  const multiplier = settings.data?.lostBookMultiplier ?? 1;
  const copyPrice = Number(loan?.bookCopy.price ?? 0);

  const estimatedCharge = markAsLost
    ? copyPrice * multiplier
    : overdueDays * finePerDay;

  return (
    <FormDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title="Record a return"
      description={
        loan
          ? `"${loan.bookCopy.book.title}" — copy ${loan.bookCopy.accessionNumber}, due ${formatDate(loan.dueDate)}.`
          : undefined
      }
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel={markAsLost ? 'Record as lost' : 'Record return'}
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {estimatedCharge > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                {markAsLost
                  ? `Replacement charge of ${formatCurrency(estimatedCharge)} (${formatCurrency(copyPrice)} × ${multiplier}).`
                  : `${overdueDays} day(s) overdue — a fine of ${formatCurrency(estimatedCharge)} will be recorded.`}
              </AlertDescription>
            </Alert>
          )}

          <FormField
            control={form.control}
            name="markAsLost"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-3">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>The copy is lost</FormLabel>
                  <FormDescription>
                    Charges the replacement cost instead of a per-day fine and withdraws the copy.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          {!markAsLost && (
            <FormField
              control={form.control}
              name="condition"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condition on return</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CONDITIONS.map((condition) => (
                        <SelectItem key={condition} value={condition}>
                          {BOOK_CONDITION_LABELS[condition]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {can('LIBRARY', 'APPROVE') && estimatedCharge > 0 && (
            <FormField
              control={form.control}
              name="waiveFine"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Waive the charge</FormLabel>
                    <FormDescription>Recorded against your name in the audit log.</FormDescription>
                  </div>
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="remarks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Remarks</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} placeholder="Optional note" />
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
