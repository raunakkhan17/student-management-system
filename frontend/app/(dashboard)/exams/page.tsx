import type { Metadata } from 'next';
import { ExamsList } from '@/components/exams/exams-list';

export const metadata: Metadata = {
  title: 'Examinations',
};

export default function ExamsPage() {
  return <ExamsList />;
}
