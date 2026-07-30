import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { appConfig } from '@/lib/config';

interface LogoProps {
  className?: string;
  /** Hides the wordmark, leaving only the mark (used in the collapsed sidebar). */
  iconOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const MARK_SIZE = {
  sm: 'size-7 rounded-md',
  md: 'size-9 rounded-lg',
  lg: 'size-11 rounded-xl',
} as const;

const ICON_SIZE = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
} as const;

const TEXT_SIZE = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
} as const;

export function Logo({ className, iconOnly = false, size = 'md' }: LogoProps) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'grid shrink-0 place-items-center bg-primary text-primary-foreground shadow-sm',
          MARK_SIZE[size],
        )}
      >
        <GraduationCap className={ICON_SIZE[size]} aria-hidden />
      </span>
      {!iconOnly && (
        <span className={cn('font-semibold tracking-tight', TEXT_SIZE[size])}>
          {appConfig.appName}
        </span>
      )}
    </span>
  );
}
