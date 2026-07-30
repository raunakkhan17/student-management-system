'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { leaveService } from '@/services/leave.service';
import {
  APPLICANT_TYPE_LABELS,
  LEAVE_TYPE_LABELS,
  type ApplicantType,
  type LeaveCalendarEntry,
} from '@/types/leave';

const ALL = '__all__';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** First and last day of the month containing `date`, as ISO date strings. */
function monthBounds(date: Date): { from: string; to: string } {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/**
 * The grid cells for a month, padded so the first row starts on a Monday.
 * `null` marks a padding cell.
 */
function buildGrid(date: Date): (Date | null)[] {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // getUTCDay is 0 for Sunday; shift so Monday is 0.
  const leadingBlanks = (first.getUTCDay() + 6) % 7;

  const cells: (Date | null)[] = Array.from({ length: leadingBlanks }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(Date.UTC(year, month, day)));
  }

  return cells;
}

function overlaps(entry: LeaveCalendarEntry, day: Date): boolean {
  const time = day.getTime();
  return (
    new Date(entry.fromDate).getTime() <= time && new Date(entry.toDate).getTime() >= time
  );
}

export function LeaveCalendarTab() {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  const [typeFilter, setTypeFilter] = useState(ALL);

  const bounds = monthBounds(cursor);

  const query = useQuery({
    queryKey: ['leave', 'calendar', bounds, typeFilter],
    queryFn: () =>
      leaveService.getCalendar({
        ...bounds,
        ...(typeFilter !== ALL ? { applicantType: typeFilter as ApplicantType } : {}),
      }),
  });

  const cells = useMemo(() => buildGrid(cursor), [cursor]);
  const entries = query.data ?? [];

  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const shiftMonth = (delta: number) => {
    setCursor(
      (current) =>
        new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + delta, 1)),
    );
  };

  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>

        <p className="text-base font-semibold">{monthLabel}</p>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[11rem] sm:ml-auto" aria-label="Filter by applicant type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Everyone</SelectItem>
            <SelectItem value="STUDENT">{APPLICANT_TYPE_LABELS.STUDENT}</SelectItem>
            <SelectItem value="TEACHER">{APPLICANT_TYPE_LABELS.TEACHER}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-[28rem] w-full" />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-3">
            <div className="min-w-[44rem]">
              <div className="text-muted-foreground grid grid-cols-7 gap-2 pb-2 text-center text-xs font-medium">
                {WEEKDAYS.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {cells.map((day, index) => {
                  if (!day) {
                    return <div key={`blank-${index}`} aria-hidden className="min-h-24 rounded-lg" />;
                  }

                  const key = day.toISOString().slice(0, 10);
                  const onLeave = entries.filter((entry) => overlaps(entry, day));

                  return (
                    <div
                      key={key}
                      className={cn(
                        'min-h-24 rounded-lg border p-2',
                        key === todayKey && 'border-primary bg-primary-muted/40',
                      )}
                    >
                      <p
                        className={cn(
                          'mb-1 text-sm font-medium tabular-nums',
                          key === todayKey && 'text-primary',
                        )}
                      >
                        {day.getUTCDate()}
                      </p>

                      <ul className="space-y-1">
                        {onLeave.slice(0, 3).map((entry) => (
                          <li key={entry.id}>
                            <StatusBadge
                              status={entry.status}
                              label={entry.applicantName}
                              className="w-full justify-start truncate text-xs"
                            />
                          </li>
                        ))}
                        {onLeave.length > 3 && (
                          <li className="text-muted-foreground text-xs">
                            +{onLeave.length - 3} more
                          </li>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!query.isLoading && entries.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="Nobody is away this month"
          description="Approved and pending leave appears on the calendar."
          size="compact"
        />
      )}

      {entries.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <h3 className="text-sm font-semibold">This month</h3>
            <ul className="divide-y">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{entry.applicantName}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {LEAVE_TYPE_LABELS[entry.type]} · {entry.totalDays} day(s)
                      {entry.identifier ? ` · ${entry.identifier}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={entry.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
