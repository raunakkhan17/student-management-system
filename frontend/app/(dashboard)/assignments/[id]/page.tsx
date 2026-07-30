import type { Metadata } from 'next';
import { AssignmentDetailScreen } from '@/components/assignments/assignment-detail';

export const metadata: Metadata = {
  title: 'Assignment',
};

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssignmentDetailScreen assignmentId={id} />;
}
