import type { Metadata } from 'next';
import { TimetableWorkspace } from '@/components/timetable/timetable-workspace';

export const metadata: Metadata = {
  title: 'Timetable',
};

export default function TimetablePage() {
  return <TimetableWorkspace />;
}
