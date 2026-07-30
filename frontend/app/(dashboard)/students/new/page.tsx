import type { Metadata } from 'next';
import { StudentAdmissionForm } from '@/components/students/student-admission-form';

export const metadata: Metadata = {
  title: 'Admit a student',
};

export default function NewStudentPage() {
  return <StudentAdmissionForm />;
}
