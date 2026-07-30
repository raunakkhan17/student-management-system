'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { feeService } from '@/services/fee.service';
import { PAYMENT_METHOD_LABELS } from '@/types/fee';

/** Printable payment receipt (PRD Module 10 — Receipts). */
export function ReceiptView({ paymentId }: { paymentId: string }) {
  const query = useQuery({
    queryKey: ['fees', 'receipts', paymentId],
    queryFn: () => feeService.getReceipt(paymentId),
  });

  if (query.isLoading) {
    return <Skeleton className="h-96 w-full max-w-2xl" />;
  }

  if (query.error || !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const { institution, payment } = query.data;
  const studentName = `${payment.student.user.firstName} ${payment.student.user.lastName}`;

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="Payment receipt"
          description={`${payment.receiptNumber} · ${studentName}`}
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Fees', href: '/fees' },
            { label: payment.receiptNumber },
          ]}
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/fees">
                  <ArrowLeft className="size-4" aria-hidden />
                  Back to fees
                </Link>
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden />
                Print
              </Button>
            </>
          }
        />
      </div>

      <Card className="mx-auto max-w-2xl print:border-0 print:shadow-none">
        <CardContent className="space-y-6 pt-6">
          <header className="space-y-1 border-b pb-5 text-center">
            <h1 className="text-xl font-semibold tracking-tight">
              {institution?.name ?? 'EduCore Institute'}
            </h1>
            {institution && (
              <p className="text-muted-foreground text-xs">
                {institution.email} · {institution.phone}
              </p>
            )}
            <p className="pt-2 text-sm font-medium">Payment receipt</p>
          </header>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Receipt no.</dt>
              <dd className="font-medium">{payment.receiptNumber}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Date</dt>
              <dd className="font-medium">{formatDateTime(payment.paidAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Student</dt>
              <dd className="font-medium">{studentName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Admission no.</dt>
              <dd className="font-medium">{payment.student.admissionNumber}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Class</dt>
              <dd className="font-medium">
                {payment.student.class?.name ?? '—'}
                {payment.student.section ? ` — ${payment.student.section.name}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Invoice</dt>
              <dd className="font-medium">{payment.invoice.invoiceNumber}</dd>
            </div>
          </dl>

          <div className="space-y-3 border-t pt-5">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground text-sm">Amount received</span>
              <span className="text-2xl font-semibold tabular-nums">
                {formatCurrency(payment.amount)}
              </span>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Method</dt>
                <dd>{PAYMENT_METHOD_LABELS[payment.method]}</dd>
              </div>
              {payment.transactionRef && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Reference</dt>
                  <dd>{payment.transactionRef}</dd>
                </div>
              )}
              {payment.installment && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Installment</dt>
                  <dd>#{payment.installment.installmentNumber}</dd>
                </div>
              )}
            </dl>
          </div>

          <dl className="space-y-2 border-t pt-5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Invoice total</dt>
              <dd className="tabular-nums">{formatCurrency(payment.invoice.totalAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Paid to date</dt>
              <dd className="tabular-nums">{formatCurrency(payment.invoice.paidAmount)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Balance remaining</dt>
              <dd className="tabular-nums">{formatCurrency(payment.invoice.balanceAmount)}</dd>
            </div>
          </dl>

          <footer className="text-muted-foreground flex flex-wrap justify-between gap-4 border-t pt-5 text-xs">
            <span>
              {payment.collectedBy
                ? `Received by ${payment.collectedBy.firstName} ${payment.collectedBy.lastName}`
                : 'Received by the finance office'}
            </span>
            <span>
              {payment.status === 'REFUNDED' ? 'REFUNDED' : 'Computer-generated receipt'}
            </span>
          </footer>
        </CardContent>
      </Card>
    </div>
  );
}
