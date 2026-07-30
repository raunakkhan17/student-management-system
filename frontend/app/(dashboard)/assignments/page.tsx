import type { Metadata } from 'next';
import { AssignmentsList } from '@/components/assignments/assignments-list';

export const metadata: Metadata = {
  title: 'Assignments',
};

export default function AssignmentsPage() {
  return <AssignmentsList />;
}
