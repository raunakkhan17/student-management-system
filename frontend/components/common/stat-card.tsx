import { TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type StatTone = 'primary' | 'success' | 'warning' | 'danger' | 'info';

const TONE_CLASS: Record<StatTone, string> = {
  primary: 'bg-primary-muted text-primary',
  success: 'bg-success-muted text-success',
  warning: 'bg-warning-muted text-warning',
  danger: 'bg-destructive-muted text-destructive',
  info: 'bg-info-muted text-info',
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Supporting line under the value, e.g. "vs last month". */
  hint?: string;
  /** Percentage change; positive renders as an upward trend. */
  trend?: number;
  /** Set when a decrease is the good outcome (e.g. pending fees). */
  invertTrend?: boolean;
  isLoading?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
  hint,
  trend,
  invertTrend = false,
  isLoading = false,
  className,
}: StatCardProps) {
  const isPositive = trend !== undefined && trend >= 0;
  const isGood = invertTrend ? !isPositive : isPositive;

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="text-muted-foreground truncate text-sm font-medium">{label}</p>

            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
            )}

            {(hint || trend !== undefined) && !isLoading && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {trend !== undefined && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 font-medium',
                      isGood ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {isPositive ? (
                      <TrendingUp className="size-3.5" aria-hidden />
                    ) : (
                      <TrendingDown className="size-3.5" aria-hidden />
                    )}
                    {Math.abs(trend).toFixed(1)}%
                  </span>
                )}
                {hint && <span className="text-muted-foreground">{hint}</span>}
              </div>
            )}
          </div>

          {Icon && (
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', TONE_CLASS[tone])}>
              <Icon className="size-5" aria-hidden />
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
