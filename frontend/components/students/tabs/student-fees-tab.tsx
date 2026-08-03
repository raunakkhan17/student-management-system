'use client';

import { useQuery } from '@tanstack/react-query';
import { ReceiptIndianRupee } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatCurrency, formatDate } from '@/lib/format';
import { feeService } from '@/services/fee.service';

/** Statuses that still owe money, for the outstanding total. */
const UNPAID = new Set(['PENDING', 'PARTIALLY_PAID', 'OVERDUE']);

export function StudentFeesTab({ studentId }: { studentId: string }) {
  const { can } = useAuth();

  const invoices = useQuery({
    queryKey: ['students', studentId, 'invoices'],
    queryFn: () => feeService.listInvoices({ studentId, limit: 100 }),
  });

  const payments = useQuery({
    queryKey: ['students', studentId, 'payments'],
    queryFn: () => feeService.listPayments({ studentId, limit: 100 }),
  });

  if (invoices.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (invoices.error || !invoices.data) {
    return <ErrorState error={invoices.error} onRetry={() => void invoices.refetch()} />;
  }

  const rows = invoices.data.items;
  const billed = rows.reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
  const paid = rows.reduce((sum, invoice) => sum + Number(invoice.paidAmount), 0);
  const outstanding = rows
    .filter((invoice) => UNPAID.has(invoice.status))
    .reduce((sum, invoice) => sum + Number(invoice.balanceAmount), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Fee position</CardTitle>
          <CardDescription>
            {rows.length === 0
              ? 'No invoices have been raised for this student.'
              : `Across ${rows.length} invoice${rows.length === 1 ? '' : 's'}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-wrap gap-x-12 gap-y-4">
            <div>
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Billed
              </dt>
              <dd className="mt-1 text-2xl font-semibold">{formatCurrency(billed)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Paid
              </dt>
              <dd className="mt-1 text-2xl font-semibold">{formatCurrency(paid)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Outstanding
              </dt>
              <dd
                className={`mt-1 text-2xl font-semibold ${outstanding > 0 ? 'text-destructive' : ''}`}
              >
                {formatCurrency(outstanding)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={ReceiptIndianRupee}
              title="No invoices"
              description="Invoices raised against this student will appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(invoice.issueDate)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(invoice.dueDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(invoice.totalAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(invoice.balanceAmount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={invoice.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {can('FEES', 'VIEW') && (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/fees/invoices/${invoice.id}`}>Open</Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments.isLoading ? (
            <div className="p-6">
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !payments.data || payments.data.items.length === 0 ? (
            <EmptyState
              icon={ReceiptIndianRupee}
              title="No payments recorded"
              description="Receipts appear here once a payment is collected."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Paid on</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.data.items.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {payment.receiptNumber}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(payment.paidAt)}
                    </TableCell>
                    <TableCell>{payment.method.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/fees/receipts/${payment.id}`}>Receipt</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
