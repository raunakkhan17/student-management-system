import type { Metadata } from 'next';
import { AssignmentForm } from '@/components/assignments/assignment-form';

export const metadata: Metadata = {
  title: 'New assignment',
};

export default function NewAssignmentPage() {
  return <AssignmentForm />;
}
