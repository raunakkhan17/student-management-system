'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { applyApiErrors } from '@/lib/form-errors';
import { academicService } from '@/services/academic.service';
import { examService } from '@/services/exam.service';
import { timetableService } from '@/services/timetable.service';
import type { ExamDetail, ExamSchedule, MarksProgressRow, SchedulePayload } from '@/types/exam';

const NONE = '__none__';
const FORM_ID = 'exam-paper-form';

const formSchema = z
  .object({
    classId: z.string().uuid('Select a class'),
    sectionId: z.string().optional(),
    subjectId: z.string().uuid('Select a subject'),
    examDate: z.string().min(1, 'Date is required'),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the 24-hour format HH:MM'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the 24-hour format HH:MM'),
    roomId: z.string().optional(),
    maxMarks: z.coerce.number().positive().max(1000),
    passingMarks: z.coerce.number().min(0).max(1000),
    weightage: z.coerce.number().positive().max(100),
    instructions: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'The end time must be after the start time',
    path: ['endTime'],
  })
  .refine((data) => data.passingMarks <= data.maxMarks, {
    message: 'Passing marks cannot exceed the maximum',
    path: ['passingMarks'],
  });

type FormValues = z.infer<typeof formSchema>;

interface ExamPapersTabProps {
  exam: ExamDetail;
  progress: MarksProgressRow[];
}

export function ExamPapersTab({ exam, progress }: ExamPapersTabProps) {
  const router = useRouter();
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<ExamSchedule | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<ExamSchedule>();

  const isPublished = exam.status === 'RESULTS_PUBLISHED';

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
    enabled: isFormOpen,
  });

  const subjects = useQuery({
    queryKey: ['academics', 'subjects', 'options'],
    queryFn: () => academicService.listSubjectOptions(),
    enabled: isFormOpen,
  });

  const rooms = useQuery({
    queryKey: ['timetable', 'rooms', 'options'],
    queryFn: () => timetableService.listRoomOptions(),
    enabled: isFormOpen,
  });

  const progressByScheduleId = useMemo(
    () => new Map(progress.map((row) => [row.scheduleId, row])),
    [progress],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      classId: '',
      sectionId: NONE,
      subjectId: '',
      examDate: exam.startDate.slice(0, 10),
      startTime: '09:00',
      endTime: '11:00',
      roomId: NONE,
      maxMarks: 100,
      passingMarks: 35,
      weightage: 100,
      instructions: '',
    },
  });

  const selectedClassId = form.watch('classId');

  const sectionChoices = useMemo(
    () => classOptions.data?.find((option) => option.id === selectedClassId)?.sections ?? [],
    [classOptions.data, selectedClassId],
  );

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            classId: editing.classId,
            sectionId: editing.sectionId ?? NONE,
            subjectId: editing.subjectId,
            examDate: editing.examDate.slice(0, 10),
            startTime: editing.startTime,
            endTime: editing.endTime,
            roomId: editing.roomId ?? NONE,
            maxMarks: Number(editing.maxMarks),
            passingMarks: Number(editing.passingMarks),
            weightage: Number(editing.weightage),
            instructions: editing.instructions ?? '',
          }
        : {
            classId: exam.classId ?? '',
            sectionId: NONE,
            subjectId: '',
            examDate: exam.startDate.slice(0, 10),
            startTime: '09:00',
            endTime: '11:00',
            roomId: NONE,
            maxMarks: 100,
            passingMarks: 35,
            weightage: 100,
            instructions: '',
          },
    );
  }, [isFormOpen, editing, form, exam.classId, exam.startDate]);

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: SchedulePayload = {
        classId: values.classId,
        sectionId: values.sectionId === NONE ? null : (values.sectionId ?? null),
        subjectId: values.subjectId,
        examDate: values.examDate,
        startTime: values.startTime,
        endTime: values.endTime,
        roomId: values.roomId === NONE ? null : (values.roomId ?? null),
        maxMarks: values.maxMarks,
        passingMarks: values.passingMarks,
        weightage: values.weightage,
        ...(values.instructions ? { instructions: values.instructions } : {}),
      };

      return editing
        ? examService.updateSchedule(exam.id, editing.id, payload)
        : examService.addSchedule(exam.id, payload);
    },
    onSuccess: async () => {
      toast.success(editing ? 'Paper updated' : 'Paper scheduled');
      setIsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (scheduleId: string) => examService.deleteSchedule(exam.id, scheduleId),
    onSuccess: async () => {
      toast.success('Paper removed');
      await queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove the paper');
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await saveMutation.mutateAsync(values);
    } catch (error) {
      const message = applyApiErrors(error, form.setError, [
        'classId',
        'sectionId',
        'subjectId',
        'examDate',
        'startTime',
        'endTime',
        'roomId',
        'maxMarks',
        'passingMarks',
      ]);
      if (message) toast.error(message);
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        {can('EXAMS', 'CREATE') && !isPublished && (
          <Button
            onClick={() => {
              setEditing(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Schedule a paper
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {exam.schedules.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No papers scheduled"
              description="Add a subject paper for each class sitting this exam."
              action={
                can('EXAMS', 'CREATE') && (
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setIsFormOpen(true);
                    }}
                  >
                    <Plus className="size-4" aria-hidden />
                    Schedule a paper
                  </Button>
                )
              }
            />
          ) : (
            <ul className="divide-y">
              {exam.schedules.map((schedule) => {
                const row = progressByScheduleId.get(schedule.id);
                const percent =
                  row && row.expected > 0 ? (row.entered / row.expected) * 100 : 0;

                return (
                  <li key={schedule.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{schedule.subject.name}</p>
                        <Badge variant="secondary">{schedule.subject.code}</Badge>
                        {row?.isComplete && (
                          <Badge className="bg-success-muted text-success border-transparent">
                            <CheckCircle2 className="size-3" aria-hidden />
                            Complete
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground truncate text-sm">
                        {schedule.class.name}
                        {schedule.section ? ` — ${schedule.section.name}` : ' (all sections)'} ·{' '}
                        {formatDate(schedule.examDate)} · {schedule.startTime}–{schedule.endTime}
                        {schedule.room ? ` · ${schedule.room.name}` : ''}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-4">
                      <span className="text-muted-foreground text-sm tabular-nums">
                        Max {Number(schedule.maxMarks)} · Pass {Number(schedule.passingMarks)}
                      </span>

                      {row && (
                        <div className="w-28 space-y-1">
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {row.entered}/{row.expected} marks
                          </span>
                          <Progress value={percent} className="h-1.5" />
                        </div>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/exams/papers/${schedule.id}/marks`)}
                      >
                        <ClipboardCheck className="size-4" aria-hidden />
                        {isPublished ? 'View marks' : 'Enter marks'}
                      </Button>

                      {!isPublished && (can('EXAMS', 'EDIT') || can('EXAMS', 'DELETE')) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label="Paper actions"
                            >
                              <MoreHorizontal className="size-4" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {can('EXAMS', 'EDIT') && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditing(schedule);
                                  setIsFormOpen(true);
                                }}
                              >
                                <Pencil className="size-4" aria-hidden />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {can('EXAMS', 'DELETE') && (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => deleteTarget.open(schedule)}
                              >
                                <Trash2 className="size-4" aria-hidden />
                                Remove
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit paper' : 'Schedule a paper'}
        description="Leave the section blank when every section sits the same paper."
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Schedule paper'}
        size="lg"
      >
        <Form {...form}>
          <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="classId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Class</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('sectionId', NONE);
                      }}
                      disabled={editing !== null}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a class" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(classOptions.data ?? []).map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name} ({option.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sectionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section</FormLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={field.onChange}
                      disabled={editing !== null || !selectedClassId}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="All sections" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>All sections</SelectItem>
                        {sectionChoices.map((section) => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="subjectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={editing !== null}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a subject" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(subjects.data ?? []).map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name} ({subject.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="examDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Must fall inside the exam window.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Starts</FormLabel>
                    <FormControl>
                      <Input {...field} type="time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ends</FormLabel>
                    <FormControl>
                      <Input {...field} type="time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="roomId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room</FormLabel>
                    <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {(rooms.data ?? []).map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            {room.name} ({room.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      Double bookings are rejected.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="weightage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weightage (%)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} max={100} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxMarks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Maximum marks</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} max={1000} step="0.5" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="passingMarks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Passing marks</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={0} max={1000} step="0.5" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instructions</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Shown to students on the schedule" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>

      <ConfirmDialog
        open={deleteTarget.isOpen}
        onOpenChange={deleteTarget.onOpenChange}
        title="Remove this paper?"
        description={
          <>
            The <strong>{deleteTarget.target?.subject.name}</strong> paper will be removed. This is
            only possible while no marks have been entered.
          </>
        }
        confirmLabel="Remove paper"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget.target) await deleteMutation.mutateAsync(deleteTarget.target.id);
        }}
      />
    </>
  );
}
