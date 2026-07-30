import type { Metadata } from 'next';
import { TransportWorkspace } from '@/components/transport/transport-workspace';

export const metadata: Metadata = {
  title: 'Transport',
};

export default function TransportPage() {
  return <TransportWorkspace />;
}
