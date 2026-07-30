import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Usually the same primary action offered in the page header. */
  action?: ReactNode;
  className?: string;
  /** `compact` fits inside a table body; `default` fills a page region. */
  size?: 'compact' | 'default';
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  size = 'default',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'default' ? 'gap-4 px-6 py-16' : 'gap-3 px-4 py-10',
        className,
      )}
    >
      <span
        className={cn(
          'bg-muted text-muted-foreground grid place-items-center rounded-full',
          size === 'default' ? 'size-14' : 'size-11',
        )}
      >
        <Icon className={size === 'default' ? 'size-6' : 'size-5'} aria-hidden />
      </span>

      <div className="space-y-1.5">
        <p className={cn('font-medium', size === 'default' ? 'text-base' : 'text-sm')}>{title}</p>
        {description && (
          <p className="text-muted-foreground mx-auto max-w-sm text-sm text-pretty">{description}</p>
        )}
      </div>

      {action}
    </div>
  );
}
