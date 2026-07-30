'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { useMemo } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { timetableService } from '@/services/timetable.service';
import type { SlotPayload } from '@/types/timetable';
import { buildSlotMap, TimetableGrid, type SlotDisplay } from './timetable-grid';

/** Read-only week view for the signed-in teacher or student. */
export function MyTimetable() {
  const { user, hasRole } = useAuth();

  const periodsQuery = useQuery({
    queryKey: ['timetable', 'periods'],
    queryFn: () => timetableService.listPeriods(),
  });

  const isTeacher = hasRole('TEACHER');
  const studentId = user?.studentProfile?.id ?? null;

  const teacherQuery = useQuery({
    queryKey: ['timetable', 'me', 'teacher'],
    queryFn: () => timetableService.getMyTeacherTimetable(),
    enabled: isTeacher,
  });

  const studentQuery = useQuery({
    queryKey: ['timetable', 'students', studentId],
    queryFn: () => timetableService.getStudentTimetable(studentId as string),
    enabled: !isTeacher && Boolean(studentId),
  });

  /** Both shapes are flattened to the same payload the grid understands. */
  const { slots, describe } = useMemo(() => {
    if (isTeacher) {
      const source = teacherQuery.data ?? [];
      const payload: SlotPayload[] = source.map((slot) => ({
        dayOfWeek: slot.dayOfWeek,
        periodId: slot.period.id,
        classSubjectId: null,
        teacherId: null,
        roomId: slot.room?.id ?? null,
        type: slot.type,
        ...(slot.note ? { note: slot.note } : {}),
      }));

      const byKey = new Map(
        source.map((slot) => [`${slot.dayOfWeek}:${slot.period.id}`, slot]),
      );

      return {
        slots: payload,
        describe: (slot: SlotPayload): SlotDisplay => {
          const original = byKey.get(`${slot.dayOfWeek}:${slot.periodId}`);
          return {
            subjectName: original?.classSubject?.subject.name ?? null,
            subjectCode: original?.classSubject?.subject.code ?? null,
            // For a teacher, the useful second line is *which class*, not who teaches.
            teacherName: original
              ? `${original.timetable.class.name} — ${original.timetable.section.name}`
              : null,
            roomName: original?.room ? `${original.room.name}` : null,
          };
        },
      };
    }

    const timetable = studentQuery.data;
    const source = timetable?.slots ?? [];

    const payload: SlotPayload[] = source.map((slot) => ({
      dayOfWeek: slot.dayOfWeek,
      periodId: slot.periodId,
      classSubjectId: slot.classSubjectId,
      teacherId: slot.teacherId,
      roomId: slot.roomId,
      type: slot.type,
      ...(slot.note ? { note: slot.note } : {}),
    }));

    const byKey = new Map(source.map((slot) => [`${slot.dayOfWeek}:${slot.periodId}`, slot]));

    return {
      slots: payload,
      describe: (slot: SlotPayload): SlotDisplay => {
        const original = byKey.get(`${slot.dayOfWeek}:${slot.periodId}`);
        return {
          subjectName: original?.classSubject?.subject.name ?? null,
          subjectCode: original?.classSubject?.subject.code ?? null,
          teacherName: original?.teacher
            ? `${original.teacher.user.firstName} ${original.teacher.user.lastName}`
            : null,
          roomName: original?.room ? original.room.name : null,
        };
      },
    };
  }, [isTeacher, teacherQuery.data, studentQuery.data]);

  const activeQuery = isTeacher ? teacherQuery : studentQuery;

  if (periodsQuery.isLoading || activeQuery.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (activeQuery.error) {
    return <ErrorState error={activeQuery.error} onRetry={() => void activeQuery.refetch()} />;
  }

  if (slots.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={CalendarClock}
            title="No timetable published"
            description={
              isTeacher
                ? 'You have no scheduled periods in any active timetable yet.'
                : 'Your section does not have an active timetable yet.'
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <TimetableGrid
          periods={periodsQuery.data ?? []}
          slots={buildSlotMap(slots)}
          describe={describe}
          readOnly
        />
      </CardContent>
    </Card>
  );
}
