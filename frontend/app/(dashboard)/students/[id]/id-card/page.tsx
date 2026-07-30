import type { Metadata } from 'next';
import { StudentIdCard } from '@/components/students/student-id-card';

export const metadata: Metadata = {
  title: 'Student ID card',
};

export default async function StudentIdCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StudentIdCard studentId={id} />;
}
