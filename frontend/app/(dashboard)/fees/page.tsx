import type { Metadata } from 'next';
import { FeesWorkspace } from '@/components/fees/fees-workspace';

export const metadata: Metadata = {
  title: 'Fees',
};

export default function FeesPage() {
  return <FeesWorkspace />;
}
