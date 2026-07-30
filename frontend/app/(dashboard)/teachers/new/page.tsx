import type { Metadata } from 'next';
import { TeacherForm } from '@/components/teachers/teacher-form';

export const metadata: Metadata = {
  title: 'Add a teacher',
};

export default function NewTeacherPage() {
  return <TeacherForm />;
}
