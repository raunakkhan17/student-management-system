import type { Metadata } from 'next';
import { HostelWorkspace } from '@/components/hostel/hostel-workspace';

export const metadata: Metadata = {
  title: 'Hostel',
};

export default function HostelPage() {
  return <HostelWorkspace />;
}
