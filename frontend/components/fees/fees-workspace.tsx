'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, IndianRupee, TrendingUp, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency, formatPercent } from '@/lib/format';
import { feeService } from '@/services/fee.service';
import { FeeStructuresTab } from './fee-structures-tab';
import { InvoicesList } from './invoices-list';
import { PaymentsTab } from './payments-tab';

export function FeesWorkspace() {
  const { can, hasRole } = useAuth();

  const isSelfService = hasRole('STUDENT', 'PARENT');
  const canManageConfig = can('FEES', 'CREATE') && !isSelfService;

  const summary = useQuery({
    queryKey: ['fees', 'summary'],
    queryFn: () => feeService.getSummary(),
    enabled: !isSelfService,
  });

  return (
    <div>
      <PageHeader
        title="Fees"
        description={
          isSelfService
            ? 'Your invoices, outstanding balance and payment history.'
            : 'Fee structures, invoicing, collection and outstanding balances.'
        }
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Fees' }]}
      />

      {!isSelfService && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total billed"
            value={formatCurrency(summary.data?.totalBilled ?? 0)}
            icon={IndianRupee}
            tone="primary"
            isLoading={summary.isLoading}
            hint={`${summary.data?.invoiceCount ?? 0} invoice(s)`}
          />
          <StatCard
            label="Collected"
            value={formatCurrency(summary.data?.totalCollected ?? 0)}
            icon={Wallet}
            tone="success"
            isLoading={summary.isLoading}
            hint={
              summary.data?.collectionRate === null || summary.data?.collectionRate === undefined
                ? undefined
                : `${formatPercent(summary.data.collectionRate)} of billed`
            }
          />
          <StatCard
            label="Outstanding"
            value={formatCurrency(summary.data?.totalOutstanding ?? 0)}
            icon={AlertTriangle}
            tone="danger"
            isLoading={summary.isLoading}
            hint={`${summary.data?.outstandingInvoiceCount ?? 0} unpaid invoice(s)`}
          />
          <StatCard
            label="Payments recorded"
            value={summary.data?.paymentCount ?? 0}
            icon={TrendingUp}
            tone="info"
            isLoading={summary.isLoading}
          />
        </div>
      )}

      <Tabs defaultValue="invoices" className="space-y-4">
        <ScrollArea className="w-full">
          <TabsList className="w-max">
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            {canManageConfig && <TabsTrigger value="structures">Fee structures</TabsTrigger>}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="invoices" className="mt-0">
          <InvoicesList />
        </TabsContent>

        <TabsContent value="payments" className="mt-0">
          <PaymentsTab />
        </TabsContent>

        {canManageConfig && (
          <TabsContent value="structures" className="mt-0">
            <FeeStructuresTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
