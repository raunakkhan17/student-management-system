'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, CheckCircle2, Send, Upload } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { AttachmentList, FileDropzone } from '@/components/common/file-dropzone';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { appConfig } from '@/lib/config';
import { formatDateTime, formatRelative } from '@/lib/format';
import { assignmentService } from '@/services/assignment.service';
import {
  ASSIGNMENT_STATUS_LABELS,
  SUBMISSION_STATUS_LABELS,
  type AssignmentStatus,
} from '@/types/assignment';
import { SubmissionEvaluator } from './submission-evaluator';

export function AssignmentDetailScreen({ assignmentId }: { assignmentId: string }) {
  const { can, hasRole } = useAuth();
  const queryClient = useQueryClient();

  const [submissionText, setSubmissionText] = useState('');
  const [submissionFiles, setSubmissionFiles] = useState<File[]>([]);
  const [statusTarget, setStatusTarget] = useState<AssignmentStatus | null>(null);

  const isStudent = hasRole('STUDENT');

  const query = useQuery({
    queryKey: ['assignments', assignmentId],
    queryFn: () => assignmentService.get(assignmentId),
  });

  const mySubmissionQuery = useQuery({
    queryKey: ['assignments', assignmentId, 'my-submission'],
    queryFn: () => assignmentService.getMySubmission(assignmentId),
    enabled: isStudent,
  });

  const submitMutation = useMutation({
    mutationFn: () => assignmentService.submit(assignmentId, submissionText, submissionFiles),
    onSuccess: async (submission) => {
      toast.success(
        submission.status === 'LATE' ? 'Submitted — marked as late' : 'Submitted successfully',
      );
      setSubmissionFiles([]);
      await queryClient.invalidateQueries({ queryKey: ['assignments', assignmentId] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not submit your work');
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: AssignmentStatus) => assignmentService.update(assignmentId, { status }),
    onSuccess: async (_data, status) => {
      toast.success(`Assignment ${ASSIGNMENT_STATUS_LABELS[status].toLowerCase()}`);
      await queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not update the assignment');
    },
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.error || !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const assignment = query.data;
  const mySubmission = mySubmissionQuery.data;
  const isOverdue = new Date(assignment.dueDate).getTime() < Date.now();
  const canSubmit =
    isStudent &&
    assignment.status === 'PUBLISHED' &&
    mySubmission?.status !== 'EVALUATED' &&
    (!isOverdue || assignment.allowLateSubmission);

  return (
    <div>
      <PageHeader
        title={assignment.title}
        description={`${assignment.subject.name} · ${assignment.class.name}${
          assignment.section ? ` — ${assignment.section.name}` : ''
        }`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Assignments', href: '/assignments' },
          { label: assignment.title },
        ]}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/assignments">
                <ArrowLeft className="size-4" aria-hidden />
                All assignments
              </Link>
            </Button>

            {can('ASSIGNMENTS', 'EDIT') && !isStudent && (
              <>
                {assignment.status === 'DRAFT' && (
                  <Button onClick={() => setStatusTarget('PUBLISHED')}>
                    <Send className="size-4" aria-hidden />
                    Publish
                  </Button>
                )}
                {assignment.status === 'PUBLISHED' && (
                  <Button variant="outline" onClick={() => setStatusTarget('CLOSED')}>
                    <CheckCircle2 className="size-4" aria-hidden />
                    Close submissions
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={assignment.status}
                  label={ASSIGNMENT_STATUS_LABELS[assignment.status]}
                />
                <Badge variant="secondary">{Number(assignment.maxMarks)} marks</Badge>
                {assignment.allowLateSubmission && (
                  <Badge variant="outline">Late submissions accepted</Badge>
                )}
              </div>
              <CardTitle className="mt-3">Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm whitespace-pre-wrap">{assignment.description}</p>

              {assignment.attachments.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Attachments</h3>
                  <AttachmentList attachments={assignment.attachments} apiUrl={appConfig.apiUrl} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* --------------------------------------------- Student submission */}
          {isStudent && (
            <Card>
              <CardHeader>
                <CardTitle>Your submission</CardTitle>
                <CardDescription>
                  {mySubmission
                    ? SUBMISSION_STATUS_LABELS[mySubmission.status]
                    : 'You have not submitted anything yet.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {mySubmission?.status === 'EVALUATED' && (
                  <Alert>
                    <CheckCircle2 className="size-4" aria-hidden />
                    <AlertTitle>
                      Marked: {mySubmission.marksObtained} / {Number(assignment.maxMarks)}
                    </AlertTitle>
                    {mySubmission.feedback && (
                      <AlertDescription>{mySubmission.feedback}</AlertDescription>
                    )}
                  </Alert>
                )}

                {mySubmission?.status === 'RESUBMIT' && (
                  <Alert variant="destructive">
                    <AlertTitle>Resubmission requested</AlertTitle>
                    {mySubmission.feedback && (
                      <AlertDescription>{mySubmission.feedback}</AlertDescription>
                    )}
                  </Alert>
                )}

                {mySubmission?.submittedAt && (
                  <p className="text-muted-foreground text-sm">
                    Submitted {formatDateTime(mySubmission.submittedAt)}
                  </p>
                )}

                {mySubmission && mySubmission.attachments.length > 0 && (
                  <AttachmentList attachments={mySubmission.attachments} apiUrl={appConfig.apiUrl} />
                )}

                {canSubmit ? (
                  <div className="space-y-4">
                    {isOverdue && (
                      <Alert variant="destructive">
                        <AlertTitle>The deadline has passed</AlertTitle>
                        <AlertDescription>
                          Your submission will be recorded as late.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-2">
                      <label htmlFor="submission-text" className="text-sm font-medium">
                        Your answer
                      </label>
                      <Textarea
                        id="submission-text"
                        rows={5}
                        value={submissionText}
                        onChange={(event) => setSubmissionText(event.target.value)}
                        placeholder="Type your response, or attach files below"
                      />
                    </div>

                    <FileDropzone
                      files={submissionFiles}
                      onChange={setSubmissionFiles}
                      disabled={submitMutation.isPending}
                      label="Attach your work"
                    />

                    <Button
                      onClick={() => submitMutation.mutate()}
                      disabled={
                        submitMutation.isPending ||
                        (submissionText.trim().length === 0 && submissionFiles.length === 0)
                      }
                    >
                      <Upload className="size-4" aria-hidden />
                      {submitMutation.isPending
                        ? 'Submitting…'
                        : mySubmission?.submittedAt
                          ? 'Resubmit'
                          : 'Submit'}
                    </Button>
                  </div>
                ) : (
                  assignment.status === 'PUBLISHED' &&
                  mySubmission?.status !== 'EVALUATED' && (
                    <Alert>
                      <CalendarClock className="size-4" aria-hidden />
                      <AlertTitle>Submissions are closed</AlertTitle>
                      <AlertDescription>
                        The deadline has passed and late submissions are not accepted for this
                        assignment.
                      </AlertDescription>
                    </Alert>
                  )
                )}
              </CardContent>
            </Card>
          )}

          {/* ------------------------------------------------ Teacher marking */}
          {!isStudent && (
            <SubmissionEvaluator
              assignmentId={assignmentId}
              maxMarks={Number(assignment.maxMarks)}
              submissions={assignment.submissions}
            />
          )}
        </div>

        {/* ------------------------------------------------------- Side panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-4">
                  <dt className="text-muted-foreground text-sm">Assigned</dt>
                  <dd className="text-sm font-medium">{formatDateTime(assignment.assignedDate)}</dd>
                </div>
                <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-4">
                  <dt className="text-muted-foreground text-sm">Due</dt>
                  <dd className="text-sm font-medium">
                    {formatDateTime(assignment.dueDate)}
                    <span className="text-muted-foreground block text-xs font-normal">
                      {formatRelative(assignment.dueDate)}
                    </span>
                  </dd>
                </div>
                <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-4">
                  <dt className="text-muted-foreground text-sm">Set by</dt>
                  <dd className="text-sm font-medium">
                    {assignment.teacher.user.firstName} {assignment.teacher.user.lastName}
                  </dd>
                </div>
                <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-4">
                  <dt className="text-muted-foreground text-sm">Marks</dt>
                  <dd className="text-sm font-medium tabular-nums">
                    {Number(assignment.maxMarks)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
        title={
          statusTarget === 'PUBLISHED' ? 'Publish this assignment?' : 'Close submissions?'
        }
        description={
          statusTarget === 'PUBLISHED'
            ? 'Students in the target class will see it immediately, and a submission row is created for each of them.'
            : 'Students will no longer be able to submit. You can still mark what has been received.'
        }
        confirmLabel={statusTarget === 'PUBLISHED' ? 'Publish' : 'Close submissions'}
        onConfirm={async () => {
          if (statusTarget) {
            await statusMutation.mutateAsync(statusTarget);
            setStatusTarget(null);
          }
        }}
      />
    </div>
  );
}
