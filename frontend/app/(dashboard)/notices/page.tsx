import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NoticeBoard } from '@/components/notices/notice-board';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Notices',
};

export default function NoticesPage() {
  return (
    // `useSearchParams` reads the `highlight` deep link, so the board needs a
    // Suspense boundary to stay statically renderable.
    <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
      <NoticeBoard />
    </Suspense>
  );
}
