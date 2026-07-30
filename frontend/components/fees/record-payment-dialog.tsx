'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/common/form-dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/format';
import { applyApiErrors } from '@/lib/form-errors';
import { feeService } from '@/services/fee.service';
import { PAYMENT_METHOD_LABELS, type Invoice, type PaymentMethod } from '@/types/fee';

const NONE = '__none__';
const FORM_ID = 'record-payment-form';

const METHODS: PaymentMethod[] = [
  'CASH',
  'UPI',
  'CARD',
  'NET_BANKING',
  'CHEQUE',
  'BANK_TRANSFER',
  'DEMAND_DRAFT',
];

interface RecordPaymentDialogProps {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
  onRecorded?: () => void;
}

export function RecordPaymentDialog({
  invoice,
  onOpenChange,
  onRecorded,
}: RecordPaymentDialogProps) {
  const queryClient = useQueryClient();

  const balance = invoice ? Number(invoice.balanceAmount) : 0;

  /** Validation is built per-invoice so the cap reflects the real balance. */
  const formSchema = useMemo(
    () =>
      z.object({
        amount: z.coerce
          .number()
          .positive('Enter an amount greater than zero')
          .max(balance, `The outstanding balance is ${balance.toFixed(2)}`),
        method: z.enum([
          'CASH',
          'CHEQUE',
          'CARD',
          'NET_BANKING',
          'UPI',
          'BANK_TRANSFER',
          'DEMAND_DRAFT',
        ]),
        installmentId: z.string().optional(),
        paidAt: z.string().min(1, 'Date is required'),
        transactionRef: z.string().trim().max(120).optional(),
        remarks: z.string().trim().max(300).optional(),
      }),
    [balance],
  );

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 0,
      method: 'CASH',
      installmentId: NONE,
      paidAt: new Date().toISOString().slice(0, 10),
      transactionRef: '',
      remarks: '',
    },
  });

  const selectedInstallmentId = form.watch('installmentId');

  /** Only installments with something still owing can take a payment. */
  const payableInstallments = useMemo(
    () =>
      (invoice?.installments ?? []).filter(
        (installment) => Number(installment.amount) - Number(installment.paidAmount) > 0,
      ),
    [invoice],
  );

  useEffect(() => {
    if (!invoice) return;

    // Default to the earliest unpaid installment, or the full balance.
    const firstDue = payableInstallments[0];
    form.reset({
      amount: firstDue
        ? Number(firstDue.amount) - Number(firstDue.paidAmount)
        : Number(invoice.balanceAmount),
      method: 'CASH',
      installmentId: firstDue?.id ?? NONE,
      paidAt: new Date().toISOString().slice(0, 10),
      transactionRef: '',
      remarks: '',
    });
  }, [invoice, form, payableInstallments]);

  // Selecting an installment snaps the amount to what that installment owes.
  useEffect(() => {
    if (!invoice || selectedInstallmentId === NONE || selectedInstallmentId === undefined) return;

    const installment = payableInstallments.find((item) => item.id === selectedInstallmentId);
    if (installment) {
      form.setValue('amount', Number(installment.amount) - Number(installment.paidAmount));
    }
  }, [selectedInstallmentId, invoice, payableInstallments, form]);

  const recordMutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (!invoice) throw new Error('No invoice selected');

      return feeService.recordPayment({
        invoiceId: invoice.id,
        installmentId: values.installmentId === NONE ? null : (values.installmentId ?? null),
        amount: values.amount,
        method: values.method,
        paidAt: new Date(values.paidAt).toISOString(),
        ...(values.transactionRef ? { transactionRef: values.transactionRef } : {}),
        ...(values.remarks ? { remarks: values.remarks } : {}),
      });
    },
    onSuccess: async (payment) => {
      toast.success(`Payment recorded — receipt ${payment.receiptNumber}`);
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['fees'] });
      onRecorded?.();
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await recordMutation.mutateAsync(values);
    } catch (error) {
      const message = applyApiErrors(error, form.setError, ['amount', 'method', 'installmentId']);
      if (message) toast.error(message);
    }
  };

  return (
    <FormDialog
      open={invoice !== null}
      onOpenChange={onOpenChange}
      title="Record a payment"
      description={
        invoice
          ? `${invoice.invoiceNumber} · ${invoice.student.user.firstName} ${invoice.student.user.lastName} · outstanding ${formatCurrency(invoice.balanceAmount)}`
          : ''
      }
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Record payment"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {recordMutation.error instanceof ApiError &&
            Object.keys(recordMutation.error.fieldErrors).length === 0 && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden />
                <AlertDescription>{recordMutation.error.message}</AlertDescription>
              </Alert>
            )}

          {payableInstallments.length > 0 && (
            <FormField
              control={form.control}
              name="installmentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Allocate to installment</FormLabel>
                  <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Against the invoice as a whole</SelectItem>
                      {payableInstallments.map((installment) => (
                        <SelectItem key={installment.id} value={installment.id}>
                          #{installment.installmentNumber} ·{' '}
                          {formatCurrency(
                            Number(installment.amount) - Number(installment.paidAmount),
                          )}{' '}
                          due {formatDate(installment.dueDate)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min={0.01}
                      max={balance}
                      step="0.01"
                      className="tabular-nums"
                      autoFocus
                    />
                  </FormControl>
                  <FormDescription>Maximum {formatCurrency(balance)}.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Method</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {PAYMENT_METHOD_LABELS[method]}
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
              name="paidAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paid on</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" max={new Date().toISOString().slice(0, 10)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="transactionRef"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Cheque / UPI / transaction no." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="remarks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Remarks</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} />
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
