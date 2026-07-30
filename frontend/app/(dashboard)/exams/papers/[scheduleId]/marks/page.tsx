import type { Metadata } from 'next';
import { MarksEntrySheet } from '@/components/exams/marks-entry-sheet';

export const metadata: Metadata = {
  title: 'Marks entry',
};

export default async function MarksEntryPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = await params;
  return <MarksEntrySheet scheduleId={scheduleId} />;
}
