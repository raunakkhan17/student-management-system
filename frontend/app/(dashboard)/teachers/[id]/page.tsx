import type { Metadata } from 'next';
import { TeacherProfile } from '@/components/teachers/teacher-profile';

export const metadata: Metadata = {
  title: 'Teacher profile',
};

export default async function TeacherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TeacherProfile teacherId={id} />;
}
