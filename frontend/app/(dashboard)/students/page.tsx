import type { Metadata } from 'next';
import { StudentsList } from '@/components/students/students-list';

export const metadata: Metadata = {
  title: 'Students',
};

export default function StudentsPage() {
  return <StudentsList />;
}
