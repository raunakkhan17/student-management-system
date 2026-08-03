'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarOff,
  CheckCheck,
  ClipboardCheck,
  Lock,
  Save,
  Send,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { academicService } from '@/services/academic.service';
import { attendanceService } from '@/services/attendance.service';
import {
  ATTENDANCE_STATUS_LABELS,
  MARKABLE_STATUSES,
  type AttendanceRecordPayload,
  type AttendanceStatus,
} from '@/types/attendance';

const NONE = '__none__';

/** Colour per status — matches the semantic tones used by StatusBadge. */
const STATUS_STYLE: Record<AttendanceStatus, string> = {
  PRESENT: 'data-[active=true]:bg-success data-[active=true]:text-success-foreground',
  ABSENT: 'data-[active=true]:bg-destructive data-[active=true]:text-destructive-foreground',
  LATE: 'data-[active=true]:bg-warning data-[active=true]:text-warning-foreground',
  HALF_DAY: 'data-[active=true]:bg-warning data-[active=true]:text-warning-foreground',
  LEAVE: 'data-[active=true]:bg-info data-[active=true]:text-info-foreground',
  HOLIDAY: 'data-[active=true]:bg-muted data-[active=true]:text-muted-foreground',
};

const SHORT_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  LATE: 'L',
  HALF_DAY: 'H',
  LEAVE: 'LV',
  HOLIDAY: '—',
};

interface MarkState {
  status: AttendanceStatus | null;
  minutesLate: string;
  remarks: string;
}

export function AttendanceSheetScreen() {
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState(NONE);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Only what the user has changed. Untouched students are read from the
  // server response at render, so a refetch never has to be copied into state.
  const [edits, setEdits] = useState<Record<string, MarkState>>({});
  const [remarksEdit, setRemarksEdit] = useState<string | null>(null);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
  });

  const sectionChoices = useMemo(
    () => classOptions.data?.find((option) => option.id === classId)?.sections ?? [],
    [classOptions.data, classId],
  );

  const offerings = useQuery({
    queryKey: ['academics', 'offerings', { classId, sectionId }],
    queryFn: () => academicService.listOfferings({ classId, limit: 100 }),
    enabled: Boolean(classId),
  });

  const isReady = Boolean(classId && sectionId && date);

  const sheetQuery = useQuery({
    queryKey: ['attendance', 'sheet', { classId, sectionId, subjectId, date }],
    queryFn: () =>
      attendanceService.getSheet({
        classId,
        sectionId,
        ...(subjectId !== NONE ? { subjectId } : {}),
        date,
      }),
    enabled: isReady,
  });

  const sheet = sheetQuery.data;

  // A different sheet — another class, section, subject or date — invalidates
  // edits typed against the previous one.
  const [editedSheet, setEditedSheet] = useState(sheet);
  if (sheet !== editedSheet) {
    setEditedSheet(sheet);
    setEdits({});
    setRemarksEdit(null);
  }

  /** Server state with the user's unsaved edits laid over the top. */
  const marks = useMemo<Record<string, MarkState>>(() => {
    if (!sheet) return {};
    return Object.fromEntries(
      sheet.students.map((student) => [
        student.studentId,
        edits[student.studentId] ?? {
          status: student.status,
          minutesLate: student.minutesLate?.toString() ?? '',
          remarks: student.remarks ?? '',
        },
      ]),
    );
  }, [sheet, edits]);

  const sessionRemarks = remarksEdit ?? sheet?.session?.remarks ?? '';
  const isLocked = sheet?.session?.status === 'LOCKED';
  const isHoliday = Boolean(sheet?.holiday);

  const buildRecords = (): AttendanceRecordPayload[] =>
    Object.entries(marks)
      .filter(([, mark]) => mark.status !== null)
      .map(([studentId, mark]) => ({
        studentId,
        status: mark.status as AttendanceStatus,
        ...(mark.minutesLate ? { minutesLate: Number(mark.minutesLate) } : {}),
        ...(mark.remarks ? { remarks: mark.remarks } : {}),
      }));

  const saveMutation = useMutation({
    mutationFn: (submit: boolean) =>
      attendanceService.mark({
        classId,
        sectionId,
        subjectId: subjectId === NONE ? null : subjectId,
        date,
        records: buildRecords(),
        submit,
        ...(sessionRemarks ? { remarks: sessionRemarks } : {}),
      }),
    onSuccess: async (_data, submit) => {
      toast.success(submit ? 'Attendance submitted' : 'Draft saved');
      await queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not save attendance');
    },
  });

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    // Read through `marks`, not `edits` — the current value may still be the
    // server's, which the user has not overridden.
    const existing = marks[studentId] ?? { status: null, minutesLate: '', remarks: '' };
    setEdits((current) => ({
      ...current,
      // Clicking the active status again clears it.
      [studentId]: {
        ...existing,
        status: existing.status === status ? null : status,
        // Minutes late only apply to PRESENT-derived states.
        minutesLate: status === 'PRESENT' || status === 'LATE' ? existing.minutesLate : '',
      },
    }));
  };

  const markAllPresent = () => {
    if (!sheet) return;
    setEdits(
      Object.fromEntries(
        sheet.students.map((student) => [
          student.studentId,
          {
            status: 'PRESENT' as AttendanceStatus,
            minutesLate: '',
            remarks: marks[student.studentId]?.remarks ?? '',
          },
        ]),
      ),
    );
  };

  const tally = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const mark of Object.values(marks)) {
      if (mark.status) counts[mark.status] = (counts[mark.status] ?? 0) + 1;
    }
    return counts;
  }, [marks]);

  const markedCount = Object.values(marks).filter((mark) => mark.status !== null).length;
  const totalStudents = sheet?.students.length ?? 0;
  const isComplete = totalStudents > 0 && markedCount === totalStudents;

  return (
    <div>
      <PageHeader
        title="Mark attendance"
        description="Pick a class, section and date, then mark the roll. Submitting locks it for editing by teachers."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Attendance' }]}
      />

      {/* --------------------------------------------------------- Selectors */}
      <Card className="mb-6">
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <label htmlFor="class-select" className="text-sm font-medium">
              Class
            </label>
            <Select
              value={classId}
              onValueChange={(value) => {
                setClassId(value);
                setSectionId('');
              }}
            >
              <SelectTrigger id="class-select" className="w-full">
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {(classOptions.data ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name} ({option.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="section-select" className="text-sm font-medium">
              Section
            </label>
            <Select value={sectionId} onValueChange={setSectionId} disabled={!classId}>
              <SelectTrigger id="section-select" className="w-full">
                <SelectValue placeholder="Select a section" />
              </SelectTrigger>
              <SelectContent>
                {sectionChoices.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="subject-select" className="text-sm font-medium">
              Subject <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Select value={subjectId} onValueChange={setSubjectId} disabled={!classId}>
              <SelectTrigger id="subject-select" className="w-full">
                <SelectValue placeholder="Whole day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Whole day</SelectItem>
                {(offerings.data?.items ?? []).map((offering) => (
                  <SelectItem key={offering.id} value={offering.subject.id}>
                    {offering.subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="date-input" className="text-sm font-medium">
              Date
            </label>
            <Input
              id="date-input"
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {!isReady ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ClipboardCheck}
              title="Choose a class and section"
              description="Pick a class, section and date above to load the roll."
            />
          </CardContent>
        </Card>
      ) : sheetQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : sheetQuery.error ? (
        <ErrorState error={sheetQuery.error} onRetry={() => void sheetQuery.refetch()} />
      ) : !sheet || sheet.students.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Users}
              title="No students in this section"
              description="Assign students to this section before marking attendance."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {isHoliday && (
            <Alert>
              <CalendarOff className="size-4" aria-hidden />
              <AlertTitle>{sheet.holiday?.name}</AlertTitle>
              <AlertDescription>
                This date is a holiday. You can still record attendance if a session genuinely ran.
              </AlertDescription>
            </Alert>
          )}

          {isLocked && (
            <Alert>
              <Lock className="size-4" aria-hidden />
              <AlertTitle>This roll is locked</AlertTitle>
              <AlertDescription>
                An administrator must reopen it before further changes can be made.
              </AlertDescription>
            </Alert>
          )}

          {/* ------------------------------------------------ Summary strip */}
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium">
                  {markedCount} of {totalStudents} marked
                </span>
                {sheet.session && <StatusBadge status={sheet.session.status} />}
                {MARKABLE_STATUSES.filter((status) => tally[status]).map((status) => (
                  <Badge key={status} variant="secondary">
                    {ATTENDANCE_STATUS_LABELS[status]}: {tally[status]}
                  </Badge>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={markAllPresent} disabled={isLocked}>
                  <CheckCheck className="size-4" aria-hidden />
                  Mark all present
                </Button>

                {can('ATTENDANCE', 'CREATE') && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => saveMutation.mutate(false)}
                      disabled={isLocked || markedCount === 0 || saveMutation.isPending}
                    >
                      <Save className="size-4" aria-hidden />
                      Save draft
                    </Button>
                    <Button
                      onClick={() => setIsSubmitConfirmOpen(true)}
                      disabled={isLocked || markedCount === 0 || saveMutation.isPending}
                    >
                      <Send className="size-4" aria-hidden />
                      Submit
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ---------------------------------------------------- Roll sheet */}
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {sheet.students.map((student) => {
                  const mark = marks[student.studentId] ?? {
                    status: null,
                    minutesLate: '',
                    remarks: '',
                  };
                  const showsLateInput = mark.status === 'PRESENT' || mark.status === 'LATE';

                  return (
                    <li
                      key={student.studentId}
                      className={cn(
                        'flex flex-col gap-3 p-4 transition-colors lg:flex-row lg:items-center',
                        mark.status === null && 'bg-warning-muted/30',
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar className="size-9 shrink-0">
                          <AvatarFallback className="bg-primary-muted text-primary text-xs font-semibold">
                            {`${student.firstName.charAt(0)}${student.lastName.charAt(0)}`.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {student.rollNumber ? `${student.rollNumber}. ` : ''}
                            {student.firstName} {student.lastName}
                          </p>
                          <p className="text-muted-foreground truncate text-sm">
                            {student.admissionNumber}
                          </p>
                        </div>
                      </div>

                      {showsLateInput && (
                        <Input
                          type="number"
                          min={0}
                          max={600}
                          inputMode="numeric"
                          placeholder="Min late"
                          className="w-full lg:w-24"
                          value={mark.minutesLate}
                          disabled={isLocked}
                          aria-label={`Minutes late for ${student.firstName} ${student.lastName}`}
                          onChange={(event) =>
                            setEdits((current) => ({
                              ...current,
                              [student.studentId]: {
                                ...mark,
                                minutesLate: event.target.value,
                              },
                            }))
                          }
                        />
                      )}

                      {/* Segmented status control — one tap per student */}
                      <div
                        className="grid grid-cols-5 gap-1 lg:w-72"
                        role="group"
                        aria-label={`Attendance for ${student.firstName} ${student.lastName}`}
                      >
                        {MARKABLE_STATUSES.map((status) => (
                          <button
                            key={status}
                            type="button"
                            disabled={isLocked}
                            data-active={mark.status === status}
                            onClick={() => setStatus(student.studentId, status)}
                            aria-pressed={mark.status === status}
                            title={ATTENDANCE_STATUS_LABELS[status]}
                            className={cn(
                              'focus-visible:ring-ring rounded-md border py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50',
                              'hover:bg-accent',
                              STATUS_STYLE[status],
                            )}
                          >
                            <span aria-hidden>{SHORT_LABEL[status]}</span>
                            <span className="sr-only">{ATTENDANCE_STATUS_LABELS[status]}</span>
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 pt-6">
              <label htmlFor="session-remarks" className="text-sm font-medium">
                Session remarks
              </label>
              <Textarea
                id="session-remarks"
                rows={2}
                value={sessionRemarks}
                disabled={isLocked}
                onChange={(event) => setRemarksEdit(event.target.value)}
                placeholder="Anything worth noting about this session"
              />
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={isSubmitConfirmOpen}
        onOpenChange={setIsSubmitConfirmOpen}
        title="Submit this attendance?"
        description={
          isComplete
            ? 'The roll will be submitted. You can still correct it until an administrator locks it.'
            : `Only ${markedCount} of ${totalStudents} students are marked. Unmarked students will be left blank.`
        }
        confirmLabel="Submit attendance"
        variant={isComplete ? 'default' : 'destructive'}
        onConfirm={async () => {
          await saveMutation.mutateAsync(true);
        }}
      />
    </div>
  );
}
