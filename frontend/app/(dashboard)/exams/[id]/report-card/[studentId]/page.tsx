import type { Metadata } from 'next';
import { ReportCardView } from '@/components/exams/report-card-view';

export const metadata: Metadata = {
  title: 'Report card',
};

export default async function ReportCardPage({
  params,
}: {
  params: Promise<{ id: string; studentId: string }>;
}) {
  const { id, studentId } = await params;
  return <ReportCardView examId={id} studentId={studentId} />;
}
