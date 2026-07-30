import type { Metadata } from 'next';
import { BulkInvoiceForm } from '@/components/fees/bulk-invoice-form';

export const metadata: Metadata = {
  title: 'Issue invoices',
};

export default function NewInvoicesPage() {
  return <BulkInvoiceForm />;
}
