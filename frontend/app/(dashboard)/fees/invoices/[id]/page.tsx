import type { Metadata } from 'next';
import { InvoiceDetailScreen } from '@/components/fees/invoice-detail';

export const metadata: Metadata = {
  title: 'Invoice',
};

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceDetailScreen invoiceId={id} />;
}
