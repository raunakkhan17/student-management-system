import type { Metadata } from 'next';
import { StudentProfile } from '@/components/students/student-profile';

export const metadata: Metadata = {
  title: 'Student profile',
};

// Next 16: route `params` is a Promise and must be awaited.
export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StudentProfile studentId={id} />;
}
