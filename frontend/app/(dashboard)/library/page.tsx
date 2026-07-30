import type { Metadata } from 'next';
import { LibraryWorkspace } from '@/components/library/library-workspace';

export const metadata: Metadata = {
  title: 'Library',
};

export default function LibraryPage() {
  return <LibraryWorkspace />;
}
