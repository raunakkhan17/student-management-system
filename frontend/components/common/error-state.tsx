'use client';

import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
  size?: 'compact' | 'default';
}

function describe(error: unknown): { title: string; description: string; offline: boolean } {
  if (error instanceof ApiError) {
    if (error.isNetworkError) {
      return {
        title: 'Cannot reach the server',
        description: 'Check your connection and try again.',
        offline: true,
      };
    }
    if (error.status === 403) {
      return {
        title: 'You do not have access',
        description: 'Ask an administrator if you need permission for this area.',
        offline: false,
      };
    }
    if (error.status === 404) {
      return {
        title: 'Not found',
        description: 'The record you are looking for may have been removed.',
        offline: false,
      };
    }
    return { title: 'Something went wrong', description: error.message, offline: false };
  }

  return {
    title: 'Something went wrong',
    description: 'An unexpected error occurred. Please try again.',
    offline: false,
  };
}

export function ErrorState({ error, title, onRetry, className, size = 'default' }: ErrorStateProps) {
  const described = describe(error);
  const Icon = described.offline ? WifiOff : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'default' ? 'gap-4 px-6 py-16' : 'gap-3 px-4 py-10',
        className,
      )}
    >
      <span
        className={cn(
          'bg-destructive-muted text-destructive grid place-items-center rounded-full',
          size === 'default' ? 'size-14' : 'size-11',
        )}
      >
        <Icon className={size === 'default' ? 'size-6' : 'size-5'} aria-hidden />
      </span>

      <div className="space-y-1.5">
        <p className={cn('font-medium', size === 'default' ? 'text-base' : 'text-sm')}>
          {title ?? described.title}
        </p>
        <p className="text-muted-foreground mx-auto max-w-sm text-sm text-pretty">
          {described.description}
        </p>
      </div>

      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}
