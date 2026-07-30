import type { Metadata } from 'next';
import { LeaveWorkspace } from '@/components/leave/leave-workspace';

export const metadata: Metadata = {
  title: 'Leave',
};

export default function LeavePage() {
  return <LeaveWorkspace />;
}
