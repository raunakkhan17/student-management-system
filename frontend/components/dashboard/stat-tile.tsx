'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StatTileProps {
  label: string;
  /** The headline figure. Already formatted — the tile does no maths. */
  value: ReactNode;
  icon: LucideIcon;
  /** Secondary line: a comparison, a breakdown, or a due date. */
  hint?: ReactNode;
  /** Turns the whole tile into a link to the module that owns the number. */
  href?: string;
  /** Draws attention when the figure needs action (overdue, unmarked, unpaid). */
  tone?: 'default' | 'warning' | 'danger';
  className?: string;
}

const TONE_STYLES = {
  default: 'bg-primary-muted text-primary',
  warning: 'bg-warning-muted text-warning',
  danger: 'bg-destructive-muted text-destructive',
} as const;

/**
 * One number, its label, and where to go for the detail. A tile is not a chart —
 * it carries a single figure, so it gets no plot and no hover layer.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  hint,
  href,
  tone = 'default',
  className,
}: StatTileProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </p>
        <span
          className={cn('grid size-8 shrink-0 place-items-center rounded-lg', TONE_STYLES[tone])}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      {/* Proportional figures: equal-width digits read loose at this size. */}
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </>
  );

  const shell = cn('bg-card rounded-xl border p-4', className);

  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link
      href={href}
      className={cn(
        shell,
        'hover:border-primary/40 focus-visible:ring-ring block transition-colors focus-visible:ring-2 focus-visible:outline-none',
      )}
    >
      {body}
    </Link>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="size-8 rounded-lg" />
      </div>
      <Skeleton className="mt-3 h-8 w-20" />
      <Skeleton className="mt-2 h-3 w-28" />
    </div>
  );
}
