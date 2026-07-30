import type { Metadata } from 'next';
import { ReceiptView } from '@/components/fees/receipt-view';

export const metadata: Metadata = {
  title: 'Payment receipt',
};

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReceiptView paymentId={id} />;
}
