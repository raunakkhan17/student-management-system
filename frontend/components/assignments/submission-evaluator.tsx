'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AttachmentList } from '@/components/common/file-dropzone';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { appConfig } from '@/lib/config';
import { formatDateTime } from '@/lib/format';
import { applyApiErrors } from '@/lib/form-errors';
import { assignmentService } from '@/services/assignment.service';
import {
  SUBMISSION_STATUS_LABELS,
  type AssignmentSubmission,
} from '@/types/assignment';

const FORM_ID = 'evaluate-form';

interface SubmissionEvaluatorProps {
  assignmentId: string;
  maxMarks: number;
  submissions: AssignmentSubmission[];
}

export function SubmissionEvaluator({
  assignmentId,
  maxMarks,
  submissions,
}: SubmissionEvaluatorProps) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<AssignmentSubmission | null>(null);

  const formSchema = z.object({
    marksObtained: z.coerce
      .number()
      .min(0, 'Marks cannot be negative')
      .max(maxMarks, `Marks cannot exceed ${maxMarks}`),
    feedback: z.string().trim().max(2000).optional(),
    status: z.enum(['EVALUATED', 'RESUBMIT']),
  });

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { marksObtained: 0, feedback: '', status: 'EVALUATED' },
  });

  useEffect(() => {
    if (!target) return;
    form.reset({
      marksObtained: target.marksObtained ? Number(target.marksObtained) : 0,
      feedback: target.feedback ?? '',
      status: target.status === 'RESUBMIT' ? 'RESUBMIT' : 'EVALUATED',
    });
  }, [target, form]);

  const evaluateMutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (!target) throw new Error('No submission selected');
      return assignmentService.evaluate(assignmentId, target.id, {
        marksObtained: values.marksObtained,
        ...(values.feedback ? { feedback: values.feedback } : {}),
        status: values.status,
      });
    },
    onSuccess: async (_data, values) => {
      toast.success(
        values.status === 'RESUBMIT' ? 'Returned to the student' : 'Submission marked',
      );
      setTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await evaluateMutation.mutateAsync(values);
    } catch (error) {
      const message = applyApiErrors(error, form.setError, ['marksObtained', 'feedback']);
      if (message) toast.error(message);
    }
  };

  const submitted = submissions.filter((submission) => submission.status !== 'PENDING');
  const pending = submissions.filter((submission) => submission.status === 'PENDING');
  const canEvaluate = can('ASSIGNMENTS', 'APPROVE');

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Submissions</CardTitle>
          <CardDescription>
            {submitted.length} received · {pending.length} still outstanding
          </CardDescription>
        </CardHeader>
        <CardContent className={submissions.length === 0 ? 'p-0' : 'p-0'}>
          {submissions.length === 0 ? (
            <EmptyState
              size="compact"
              icon={ClipboardCheck}
              title="No submissions yet"
              description="Submission rows are created for each student once the assignment is published."
            />
          ) : (
            <ul className="divide-y">
              {submissions.map((submission) => (
                <li
                  key={submission.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {submission.student.rollNumber ? `${submission.student.rollNumber}. ` : ''}
                      {submission.student.user.firstName} {submission.student.user.lastName}
                    </p>
                    <p className="text-muted-foreground truncate text-sm">
                      {submission.student.admissionNumber}
                      {submission.submittedAt
                        ? ` · ${formatDateTime(submission.submittedAt)}`
                        : ''}
                    </p>

                    {submission.content && (
                      <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                        {submission.content}
                      </p>
                    )}

                    {submission.attachments.length > 0 && (
                      <div className="mt-2">
                        <AttachmentList
                          attachments={submission.attachments}
                          apiUrl={appConfig.apiUrl}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    {submission.marksObtained !== null && (
                      <span className="text-sm font-semibold tabular-nums">
                        {Number(submission.marksObtained)} / {maxMarks}
                      </span>
                    )}

                    <StatusBadge
                      status={submission.status}
                      label={SUBMISSION_STATUS_LABELS[submission.status]}
                    />

                    {canEvaluate && submission.status !== 'PENDING' && (
                      <Button variant="outline" size="sm" onClick={() => setTarget(submission)}>
                        {submission.status === 'EVALUATED' ? (
                          <>
                            <RotateCcw className="size-4" aria-hidden />
                            Remark
                          </>
                        ) : (
                          <>
                            <ClipboardCheck className="size-4" aria-hidden />
                            Mark
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title={
          target
            ? `Mark ${target.student.user.firstName} ${target.student.user.lastName}`
            : 'Mark submission'
        }
        description={`Out of ${maxMarks} marks.`}
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel="Save mark"
      >
        <Form {...form}>
          <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <FormField
              control={form.control}
              name="marksObtained"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marks awarded</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={0} max={maxMarks} step="0.5" autoFocus />
                  </FormControl>
                  <FormDescription>Maximum {maxMarks}.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="feedback"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Feedback</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={4} placeholder="What went well, what to improve" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Outcome</FormLabel>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant={field.value === 'EVALUATED' ? 'default' : 'outline'}
                      onClick={() => field.onChange('EVALUATED')}
                      className="justify-start"
                    >
                      <ClipboardCheck className="size-4" aria-hidden />
                      Mark as final
                    </Button>
                    <Button
                      type="button"
                      variant={field.value === 'RESUBMIT' ? 'default' : 'outline'}
                      onClick={() => field.onChange('RESUBMIT')}
                      className="justify-start"
                    >
                      <RotateCcw className="size-4" aria-hidden />
                      Ask to resubmit
                    </Button>
                  </div>
                  <FormDescription>
                    Asking for a resubmission clears the mark once the student submits again.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>
    </>
  );
}
