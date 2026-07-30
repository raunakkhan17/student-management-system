'use client';

import { cn } from '@/lib/utils';
import { scorePassword } from '@/lib/validations/auth';

const LEVELS = [
  { label: 'Too weak', bar: 'bg-destructive', text: 'text-destructive' },
  { label: 'Weak', bar: 'bg-destructive', text: 'text-destructive' },
  { label: 'Fair', bar: 'bg-warning', text: 'text-warning' },
  { label: 'Good', bar: 'bg-info', text: 'text-info' },
  { label: 'Strong', bar: 'bg-success', text: 'text-success' },
] as const;

/** Four-segment strength meter shown under a new-password field. */
export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;

  const score = scorePassword(password);
  const level = LEVELS[score] ?? LEVELS[0];

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1" role="presentation">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              segment <= score ? level.bar : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className={cn('text-xs font-medium', level.text)} aria-live="polite">
        Password strength: {level.label}
      </p>
    </div>
  );
}
