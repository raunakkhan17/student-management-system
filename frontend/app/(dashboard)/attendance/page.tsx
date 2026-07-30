import type { Metadata } from 'next';
import { AttendanceWorkspace } from '@/components/attendance/attendance-workspace';

export const metadata: Metadata = {
  title: 'Attendance',
};

export default function AttendancePage() {
  return <AttendanceWorkspace />;
}
