'use client';

import { Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useIdleTimeout } from '@/hooks/use-idle-timeout';
import { useAuthStore } from '@/store/auth-store';

/** Inactivity budget before the session ends (PRD Module 1 — Session Timeout). */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_MS = 2 * 60 * 1000;

export function SessionTimeoutDialog() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');

  const handleTimeout = useCallback(async () => {
    await logout();
    router.replace('/login?reason=timeout');
  }, [logout, router]);

  const { isWarning, secondsRemaining, stayActive } = useIdleTimeout({
    timeoutMs: IDLE_TIMEOUT_MS,
    warningMs: WARNING_MS,
    enabled: isAuthenticated,
    onTimeout: () => void handleTimeout(),
  });

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  return (
    <AlertDialog open={isWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <span className="bg-warning-muted text-warning grid size-11 place-items-center rounded-full">
            <Clock className="size-5" aria-hidden />
          </span>
          <AlertDialogTitle>Still there?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ll be signed out in{' '}
            <span className="text-foreground font-semibold tabular-nums">
              {minutes}:{seconds.toString().padStart(2, '0')}
            </span>{' '}
            because of inactivity. Any unsaved work will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void handleTimeout()}>Sign out now</AlertDialogCancel>
          <AlertDialogAction onClick={stayActive}>Stay signed in</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
