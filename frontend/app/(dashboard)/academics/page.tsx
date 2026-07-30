import type { Metadata } from 'next';
import { AcademicsWorkspace } from '@/components/academics/academics-workspace';

export const metadata: Metadata = {
  title: 'Academic setup',
};

export default function AcademicsPage() {
  return <AcademicsWorkspace />;
}
