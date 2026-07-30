import type { Metadata } from 'next';
import { TeachersList } from '@/components/teachers/teachers-list';

export const metadata: Metadata = {
  title: 'Teachers',
};

export default function TeachersPage() {
  return <TeachersList />;
}
