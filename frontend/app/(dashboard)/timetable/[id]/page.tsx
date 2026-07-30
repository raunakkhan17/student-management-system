import type { Metadata } from 'next';
import { TimetableEditor } from '@/components/timetable/timetable-editor';

export const metadata: Metadata = {
  title: 'Timetable grid',
};

export default async function TimetableEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TimetableEditor timetableId={id} />;
}
