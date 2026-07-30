'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, Receipt, Undo2, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { feeService } from '@/services/fee.service';
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type PaymentSummary,
} from '@/types/fee';
import { RecordPaymentDialog } from './record-payment-dialog';

export function InvoiceDetailScreen({ invoiceId }: { invoiceId: string }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const refundTarget = useConfirmTarget<PaymentSummary>();

  const query = useQuery({
    queryKey: ['fees', 'invoices', invoiceId],
    queryFn: () => feeService.getInvoice(invoiceId),
  });

  const refundMutation = useMutation({
    mutationFn: (paymentId: string) =>
      feeService.refundPayment(paymentId, 'Refunded by the finance office'),
    onSuccess: async () => {
      toast.success('Payment refunded');
      await queryClient.invalidateQueries({ queryKey: ['fees'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not refund the payment');
    },
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.error || !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const invoice = query.data;
  const total = Number(invoice.totalAmount);
  const paid = Number(invoice.paidAmount);
  const balance = Number(invoice.balanceAmount);
  const paidPercent = total === 0 ? 100 : (paid / total) * 100;

  const completedPayments = invoice.payments.filter((payment) => payment.status === 'COMPLETED');

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title={invoice.invoiceNumber}
          description={`${invoice.student.user.firstName} ${invoice.student.user.lastName} · ${invoice.student.admissionNumber}${
            invoice.student.class ? ` · ${invoice.student.class.name}` : ''
          }`}
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Fees', href: '/fees' },
            { label: invoice.invoiceNumber },
          ]}
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/fees">
                  <ArrowLeft className="size-4" aria-hidden />
                  All invoices
                </Link>
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden />
                Print
              </Button>
              {can('FEES', 'CREATE') && balance > 0 && invoice.status !== 'CANCELLED' && (
                <Button onClick={() => setIsPaymentOpen(true)}>
                  <Wallet className="size-4" aria-hidden />
                  Record payment
                </Button>
              )}
            </>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {/* ------------------------------------------------- Invoice lines */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={invoice.status} label={INVOICE_STATUS_LABELS[invoice.status]} />
                {invoice.feeStructure && (
                  <Badge variant="outline">{invoice.feeStructure.name}</Badge>
                )}
                <Badge variant="secondary">{invoice.academicYear.name}</Badge>
              </div>
              <CardTitle className="mt-3">Charges</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.description}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{item.feeCategory.name}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(item.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals ladder — subtotal through to balance */}
              <dl className="ml-auto max-w-sm space-y-2 border-t pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{formatCurrency(invoice.subtotal)}</dd>
                </div>

                {Number(invoice.scholarshipAmount) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Scholarship</dt>
                    <dd className="text-success tabular-nums">
                      −{formatCurrency(invoice.scholarshipAmount)}
                    </dd>
                  </div>
                )}

                {Number(invoice.discountAmount) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Discount</dt>
                    <dd className="text-success tabular-nums">
                      −{formatCurrency(invoice.discountAmount)}
                    </dd>
                  </div>
                )}

                {Number(invoice.lateFeeAmount) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Late fee</dt>
                    <dd className="text-destructive tabular-nums">
                      +{formatCurrency(invoice.lateFeeAmount)}
                    </dd>
                  </div>
                )}

                <div className="flex justify-between border-t pt-2 text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatCurrency(invoice.totalAmount)}</dd>
                </div>

                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Paid</dt>
                  <dd className="text-success tabular-nums">{formatCurrency(invoice.paidAmount)}</dd>
                </div>

                <div className="flex justify-between text-base font-semibold">
                  <dt>Outstanding</dt>
                  <dd className={cn('tabular-nums', balance > 0 ? 'text-destructive' : 'text-success')}>
                    {formatCurrency(invoice.balanceAmount)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* -------------------------------------------------- Payments */}
          <Card>
            <CardHeader>
              <CardTitle>Payment history</CardTitle>
              <CardDescription>
                {completedPayments.length} payment{completedPayments.length === 1 ? '' : 's'}{' '}
                received
              </CardDescription>
            </CardHeader>
            <CardContent className={invoice.payments.length === 0 ? 'p-0' : 'p-0'}>
              {invoice.payments.length === 0 ? (
                <EmptyState
                  size="compact"
                  icon={Receipt}
                  title="No payments yet"
                  description="Recorded payments and their receipts appear here."
                />
              ) : (
                <ul className="divide-y">
                  {invoice.payments.map((payment) => (
                    <li
                      key={payment.id}
                      className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{payment.receiptNumber}</p>
                        <p className="text-muted-foreground truncate text-sm">
                          {PAYMENT_METHOD_LABELS[payment.method]} ·{' '}
                          {formatDateTime(payment.paidAt)}
                          {payment.collectedBy
                            ? ` · ${payment.collectedBy.firstName} ${payment.collectedBy.lastName}`
                            : ''}
                        </p>
                        {payment.transactionRef && (
                          <p className="text-muted-foreground truncate text-xs">
                            Ref: {payment.transactionRef}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(payment.amount)}
                        </span>
                        <StatusBadge status={payment.status} />

                        {can('FEES', 'APPROVE') && payment.status === 'COMPLETED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => refundTarget.open(payment)}
                          >
                            <Undo2 className="size-4" aria-hidden />
                            Refund
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* -------------------------------------------------------- Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Collection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Collected</span>
                  <span className="font-medium tabular-nums">{Math.round(paidPercent)}%</span>
                </div>
                <Progress value={paidPercent} className="h-2" />
              </div>

              <dl className="divide-y text-sm">
                <div className="flex justify-between py-2">
                  <dt className="text-muted-foreground">Issued</dt>
                  <dd>{formatDate(invoice.issueDate)}</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-muted-foreground">Due</dt>
                  <dd
                    className={cn(
                      new Date(invoice.dueDate).getTime() < Date.now() &&
                        balance > 0 &&
                        'text-destructive font-medium',
                    )}
                  >
                    {formatDate(invoice.dueDate)}
                  </dd>
                </div>
                {invoice.createdBy && (
                  <div className="flex justify-between py-2">
                    <dt className="text-muted-foreground">Issued by</dt>
                    <dd>
                      {invoice.createdBy.firstName} {invoice.createdBy.lastName}
                    </dd>
                  </div>
                )}
              </dl>

              {invoice.notes && (
                <p className="text-muted-foreground border-t pt-3 text-sm">{invoice.notes}</p>
              )}
            </CardContent>
          </Card>

          {invoice.installments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Installments</CardTitle>
                <CardDescription>
                  {invoice.installments.filter((item) => item.status === 'PAID').length} of{' '}
                  {invoice.installments.length} settled
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {invoice.installments.map((installment) => {
                    const owing = Number(installment.amount) - Number(installment.paidAmount);
                    return (
                      <li key={installment.id} className="flex items-center gap-3 p-4">
                        <span className="bg-muted grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums">
                          {installment.installmentNumber}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium tabular-nums">
                            {formatCurrency(installment.amount)}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            Due {formatDate(installment.dueDate)}
                            {owing > 0 && owing < Number(installment.amount)
                              ? ` · ${formatCurrency(owing)} left`
                              : ''}
                          </p>
                        </div>
                        <StatusBadge status={installment.status} />
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <RecordPaymentDialog
        invoice={isPaymentOpen ? invoice : null}
        onOpenChange={(open) => setIsPaymentOpen(open)}
      />

      <ConfirmDialog
        open={refundTarget.isOpen}
        onOpenChange={refundTarget.onOpenChange}
        title="Refund this payment?"
        description={
          <>
            <strong>{formatCurrency(refundTarget.target?.amount ?? 0)}</strong> on receipt{' '}
            <strong>{refundTarget.target?.receiptNumber}</strong> will be reversed. The invoice
            balance is restored and the payment is kept in the ledger as refunded.
          </>
        }
        confirmLabel="Refund payment"
        variant="destructive"
        onConfirm={async () => {
          if (refundTarget.target) await refundMutation.mutateAsync(refundTarget.target.id);
        }}
      />
    </div>
  );
}
