import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MessagesWorkspace } from '@/components/messages/messages-workspace';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Messages',
};

export default function MessagesPage() {
  return (
    // `useSearchParams` reads the `conversation` deep link from a notification.
    <Suspense fallback={<Skeleton className="h-[34rem] w-full" />}>
      <MessagesWorkspace />
    </Suspense>
  );
}
