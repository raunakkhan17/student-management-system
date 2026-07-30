'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { useAuthStore } from '@/store/auth-store';

/**
 * Resolves the session before rendering protected content.
 *
 * `proxy.ts` already redirects visitors without a session cookie; this fills in
 * the user record and handles the case where the cookie exists but the session
 * is no longer valid server-side.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const loadSession = useAuthStore((state) => state.loadSession);
  const clear = useAuthStore((state) => state.clear);

  useEffect(() => {
    if (status === 'idle') {
      void loadSession();
    }
  }, [status, loadSession]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [status, router]);

  // The API client emits this when a refresh attempt fails mid-session.
  useEffect(() => {
    const onExpired = () => clear();
    window.addEventListener('educore:session-expired', onExpired);
    return () => window.removeEventListener('educore:session-expired', onExpired);
  }, [clear]);

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4" role="status">
        <Logo size="lg" />
        <span
          className="border-muted-foreground/30 border-t-primary size-6 animate-spin rounded-full border-2"
          aria-hidden
        />
        <span className="sr-only">Loading your workspace…</span>
      </div>
    );
  }

  return <>{children}</>;
}
