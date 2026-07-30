'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BarChart3,
  ClipboardCheck,
  Plus,
  Send,
  Trophy,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { formatDate, formatPercent } from '@/lib/format';
import { examService } from '@/services/exam.service';
import { EXAM_STATUS_LABELS, EXAM_TYPE_LABELS, type ExamSchedule } from '@/types/exam';
import { ExamPapersTab } from './exam-papers-tab';
import { ExamRankingsTab } from './exam-rankings-tab';

export function ExamDetailScreen({ examId }: { examId: string }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [allowIncomplete, setAllowIncomplete] = useState(false);
  const withdrawTarget = useConfirmTarget<true>();

  const examQuery = useQuery({
    queryKey: ['exams', examId],
    queryFn: () => examService.get(examId),
  });

  const progressQuery = useQuery({
    queryKey: ['exams', examId, 'progress'],
    queryFn: () => examService.getProgress(examId),
  });

  const statsQuery = useQuery({
    queryKey: ['exams', examId, 'statistics'],
    queryFn: () => examService.getStatistics(examId),
    enabled: examQuery.data?.status === 'RESULTS_PUBLISHED',
  });

  const publishMutation = useMutation({
    mutationFn: (incomplete: boolean) => examService.publish(examId, incomplete),
    onSuccess: async (result) => {
      toast.success(`Results published for ${result.published} student(s)`);
      setAllowIncomplete(false);
      await queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        toast.error(error.message);
        // The API rejects incomplete entry unless explicitly allowed; offer that.
        if (error.message.includes('missing')) setAllowIncomplete(true);
        return;
      }
      toast.error('Could not publish the results');
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () => examService.withdraw(examId),
    onSuccess: async () => {
      toast.success('Results withdrawn');
      await queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not withdraw the results');
    },
  });

  if (examQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (examQuery.error || !examQuery.data) {
    return <ErrorState error={examQuery.error} onRetry={() => void examQuery.refetch()} />;
  }

  const exam = examQuery.data;
  const progress = progressQuery.data ?? [];
  const isPublished = exam.status === 'RESULTS_PUBLISHED';

  const totalExpected = progress.reduce((sum, row) => sum + row.expected, 0);
  const totalEntered = progress.reduce((sum, row) => sum + row.entered, 0);
  const completePapers = progress.filter((row) => row.isComplete).length;

  return (
    <div>
      <PageHeader
        title={exam.name}
        description={`${EXAM_TYPE_LABELS[exam.type]} · ${exam.academicYear.name} · ${formatDate(exam.startDate)} – ${formatDate(exam.endDate)}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Examinations', href: '/exams' },
          { label: exam.name },
        ]}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/exams">
                <ArrowLeft className="size-4" aria-hidden />
                All exams
              </Link>
            </Button>

            {can('EXAMS', 'APPROVE') &&
              (isPublished ? (
                <Button variant="outline" onClick={() => withdrawTarget.open(true)}>
                  <Undo2 className="size-4" aria-hidden />
                  Withdraw results
                </Button>
              ) : (
                <Button
                  onClick={() => setIsPublishOpen(true)}
                  disabled={exam._count.schedules === 0}
                >
                  <Send className="size-4" aria-hidden />
                  Publish results
                </Button>
              ))}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge status={exam.status} label={EXAM_STATUS_LABELS[exam.status]} />
        <Badge variant="secondary">{exam._count.schedules} paper(s)</Badge>
        {exam.gradeScale && <Badge variant="outline">{exam.gradeScale.name}</Badge>}
        {exam.class && <Badge variant="outline">{exam.class.name}</Badge>}
      </div>

      {/* -------------------------------------------------- Published summary */}
      {isPublished && statsQuery.data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Students"
            value={statsQuery.data.studentCount}
            icon={Trophy}
            tone="primary"
          />
          <StatCard
            label="Pass rate"
            value={statsQuery.data.passRate === null ? '—' : formatPercent(statsQuery.data.passRate)}
            icon={BarChart3}
            tone="success"
          />
          <StatCard
            label="Average"
            value={
              statsQuery.data.averagePercentage === null
                ? '—'
                : formatPercent(statsQuery.data.averagePercentage)
            }
            tone="info"
          />
          <StatCard
            label="Failed"
            value={statsQuery.data.failCount}
            tone="danger"
            hint={`Highest ${statsQuery.data.highestPercentage === null ? '—' : formatPercent(statsQuery.data.highestPercentage)}`}
          />
        </div>
      )}

      {/* --------------------------------------------- Marks entry progress */}
      {!isPublished && progress.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Marks entry progress</CardTitle>
            <CardDescription>
              {completePapers} of {progress.length} papers complete · {totalEntered} of{' '}
              {totalExpected} marks entered
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress
              value={totalExpected === 0 ? 0 : (totalEntered / totalExpected) * 100}
              className="h-2"
            />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="papers" className="space-y-4">
        <ScrollArea className="w-full">
          <TabsList className="w-max">
            <TabsTrigger value="papers">Papers</TabsTrigger>
            {isPublished && <TabsTrigger value="rankings">Rankings</TabsTrigger>}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="papers" className="mt-0">
          <ExamPapersTab exam={exam} progress={progress} />
        </TabsContent>

        {isPublished && (
          <TabsContent value="rankings" className="mt-0">
            <ExamRankingsTab examId={examId} />
          </TabsContent>
        )}
      </Tabs>

      <ConfirmDialog
        open={isPublishOpen}
        onOpenChange={setIsPublishOpen}
        title="Publish results?"
        description={
          allowIncomplete
            ? 'Some marks are still missing. Publishing now will compute results from what has been entered — missing papers count as zero.'
            : 'Report cards, grades and ranks will be computed for the whole cohort, and students and parents will be notified.'
        }
        confirmLabel={allowIncomplete ? 'Publish anyway' : 'Publish results'}
        variant={allowIncomplete ? 'destructive' : 'default'}
        onConfirm={async () => {
          await publishMutation.mutateAsync(allowIncomplete);
        }}
      />

      <ConfirmDialog
        open={withdrawTarget.isOpen}
        onOpenChange={withdrawTarget.onOpenChange}
        title="Withdraw published results?"
        description="Students and parents will no longer see their results, and marks become editable again. Report cards are kept but unpublished."
        confirmLabel="Withdraw results"
        variant="destructive"
        onConfirm={async () => {
          await withdrawMutation.mutateAsync();
        }}
      />
    </div>
  );
}

/** Shared by the papers tab — kept here so the empty state reads consistently. */
export function NoPapersState({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      icon={ClipboardCheck}
      title="No papers scheduled"
      description="Add a subject paper for each class sitting this exam."
      action={
        onAdd && (
          <Button onClick={onAdd}>
            <Plus className="size-4" aria-hidden />
            Schedule a paper
          </Button>
        )
      }
    />
  );
}

export type { ExamSchedule };
