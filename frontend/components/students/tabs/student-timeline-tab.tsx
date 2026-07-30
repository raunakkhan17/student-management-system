'use client';

import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime } from '@/lib/format';
import { studentService } from '@/services/student.service';
import { TIMELINE_EVENT_LABELS } from '@/types/student';

export function StudentTimelineTab({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: ['students', studentId, 'timeline'],
    queryFn: () => studentService.getTimeline(studentId),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (query.error || !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const { events, enrollment } = query.data;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Everything recorded against this student.</CardDescription>
        </CardHeader>
        <CardContent className={events.length === 0 ? 'p-0' : undefined}>
          {events.length === 0 ? (
            <EmptyState
              size="compact"
              icon={History}
              title="Nothing recorded yet"
              description="Admission, promotions and other notable events appear here."
            />
          ) : (
            <ol className="relative space-y-6 border-l pl-6">
              {events.map((event) => (
                <li key={event.id} className="relative">
                  {/* Timeline node */}
                  <span
                    className="bg-primary ring-background absolute -left-[1.9rem] top-1.5 size-2.5 rounded-full ring-4"
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{event.title}</p>
                    <Badge variant="secondary">{TIMELINE_EVENT_LABELS[event.type]}</Badge>
                  </div>
                  {event.description && (
                    <p className="text-muted-foreground mt-1 text-sm">{event.description}</p>
                  )}
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatDateTime(event.occurredAt)}
                    {event.createdBy
                      ? ` · ${event.createdBy.firstName} ${event.createdBy.lastName}`
                      : ''}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enrolment history</CardTitle>
          <CardDescription>Admissions, promotions and transfers.</CardDescription>
        </CardHeader>
        <CardContent className={enrollment.length === 0 ? 'p-0' : undefined}>
          {enrollment.length === 0 ? (
            <EmptyState size="compact" icon={History} title="No movement recorded" />
          ) : (
            <ul className="space-y-4">
              {enrollment.map((entry) => (
                <li key={entry.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="outline">{entry.type.replace(/_/g, ' ').toLowerCase()}</Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(entry.effectiveDate)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">
                    {entry.fromClass ? (
                      <>
                        {entry.fromClass.name}
                        {entry.fromSection ? ` — ${entry.fromSection.name}` : ''}
                        <span className="text-muted-foreground"> → </span>
                      </>
                    ) : null}
                    {entry.toClass ? (
                      <>
                        {entry.toClass.name}
                        {entry.toSection ? ` — ${entry.toSection.name}` : ''}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Unplaced</span>
                    )}
                  </p>
                  {entry.remarks && (
                    <p className="text-muted-foreground mt-1 text-sm">{entry.remarks}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
