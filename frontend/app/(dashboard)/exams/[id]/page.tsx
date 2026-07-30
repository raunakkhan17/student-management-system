import type { Metadata } from 'next';
import { ExamDetailScreen } from '@/components/exams/exam-detail';

export const metadata: Metadata = {
  title: 'Exam',
};

export default async function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExamDetailScreen examId={id} />;
}
