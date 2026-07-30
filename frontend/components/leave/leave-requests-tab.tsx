'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarDays, Check, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useTableState } from '@/hooks/use-table-state';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { leaveService } from '@/services/leave.service';
import {
  APPLICANT_TYPE_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  type LeaveRequest,
  type LeaveType,
} from '@/types/leave';
import type { RequestStatus } from '@/types/hostel';
import { ApplyLeaveDialog } from './apply-leave-dialog';

const ALL = '__all__';
const REVIEW_FORM_ID = 'review-leave-form';
const STATUSES: RequestStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const LEAVE_TYPES: LeaveType[] = [
  'SICK',
  'CASUAL',
  'EMERGENCY',
  'VACATION',
  'MATERNITY',
  'UNPAID',
  'OTHER',
];

const reviewFormSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewComment: z.string().trim().max(500).optional(),
});

type ReviewFormValues = z.infer<typeof reviewFormSchema>;

export function LeaveRequestsTab() {
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const table = useTableState({ defaultSortBy: 'fromDate', defaultSortOrder: 'desc' });

  const [statusFilter, setStatusFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<LeaveRequest | null>(null);
  const cancelTarget = useConfirmTarget<LeaveRequest>();

  const params = {
    ...table.queryParams,
    ...(statusFilter !== ALL ? { status: statusFilter } : {}),
    ...(typeFilter !== ALL ? { type: typeFilter as LeaveType } : {}),
  };

  const query = useQuery({
    queryKey: ['leave', 'requests', params],
    queryFn: () => leaveService.list(params),
  });

  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: { status: 'APPROVED', reviewComment: '' },
  });

  useEffect(() => {
    if (!reviewTarget) return;
    form.reset({ status: 'APPROVED', reviewComment: '' });
  }, [reviewTarget, form]);

  const reviewMutation = useMutation({
    mutationFn: (values: ReviewFormValues) => {
      if (!reviewTarget) throw new Error('No request selected');
      return leaveService.review(reviewTarget.id, {
        status: values.status,
        ...(values.reviewComment ? { reviewComment: values.reviewComment } : {}),
      });
    },
    onSuccess: async (request) => {
      toast.success(request.status === 'APPROVED' ? 'Leave approved' : 'Leave request rejected');
      await queryClient.invalidateQueries({ queryKey: ['leave'] });
      setReviewTarget(null);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not review the request');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (request: LeaveRequest) => leaveService.cancel(request.id),
    onSuccess: async () => {
      toast.success('Leave request cancelled');
      await queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not cancel the request');
    },
  });

  const isFiltered = table.state.search.length > 0 || statusFilter !== ALL || typeFilter !== ALL;

  const columns = useMemo<ColumnDef<LeaveRequest, unknown>[]>(
    () => [
      {
        id: 'applicant',
        header: 'Applicant',
        cell: ({ row }) => {
          const { applicant } = row.original;
          const identifier =
            applicant.studentProfile?.admissionNumber ??
            applicant.teacherProfile?.employeeId ??
            applicant.email;

          return (
            <div className="min-w-0">
              <p className="truncate font-medium">
                {applicant.firstName} {applicant.lastName}
              </p>
              <p className="text-muted-foreground truncate text-sm">
                {identifier} · {APPLICANT_TYPE_LABELS[row.original.applicantType]}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <Badge variant="secondary">{LEAVE_TYPE_LABELS[row.original.type]}</Badge>
        ),
      },
      {
        accessorKey: 'fromDate',
        header: 'Dates',
        meta: { sortKey: 'fromDate' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">
              {formatDate(row.original.fromDate)} – {formatDate(row.original.toDate)}
            </p>
            <p className="text-muted-foreground text-sm">{row.original.totalDays} day(s)</p>
          </div>
        ),
      },
      {
        accessorKey: 'reason',
        header: 'Reason',
        meta: { hideOnMobile: true },
        cell: ({ row }) => (
          <p className="max-w-[16rem] truncate text-sm">{row.original.reason}</p>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            label={LEAVE_STATUS_LABELS[row.original.status]}
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        meta: { cellClassName: 'w-32' },
        cell: ({ row }) => {
          const request = row.original;
          const isMine = request.applicantId === user?.id;
          const canReview = can('LEAVE', 'APPROVE') && request.status === 'PENDING' && !isMine;
          const canCancel =
            isMine && (request.status === 'PENDING' || request.status === 'APPROVED');

          if (!canReview && !canCancel) {
            return <span className="text-muted-foreground text-sm">—</span>;
          }

          return (
            <div className="flex items-center gap-2">
              {canReview && (
                <Button variant="outline" size="sm" onClick={() => setReviewTarget(request)}>
                  Review
                </Button>
              )}
              {canCancel && (
                <Button variant="ghost" size="sm" onClick={() => cancelTarget.open(request)}>
                  Cancel
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [can, cancelTarget, user?.id],
  );

  const decision = form.watch('status');

  return (
    <>
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        {...(query.data ? { pagination: query.data.pagination } : {})}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        sortBy={table.state.sortBy}
        sortOrder={table.state.sortOrder}
        onSortChange={table.toggleSort}
        onPageChange={table.setPage}
        onLimitChange={table.setLimit}
        getRowId={(row) => row.id}
        toolbar={
          <DataTableToolbar
            search={table.state.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Applicant or reason…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setStatusFilter(ALL);
              setTypeFilter(ALL);
            }}
            filters={
              <>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[10rem]" aria-label="Filter by status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {LEAVE_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[10rem]" aria-label="Filter by leave type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All types</SelectItem>
                    {LEAVE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {LEAVE_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              can('LEAVE', 'CREATE') && (
                <Button onClick={() => setIsApplyOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  Apply for leave
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={CalendarDays}
            title={isFiltered ? 'No matching requests' : 'No leave requests'}
            description={
              isFiltered
                ? 'Try a different filter or search term.'
                : 'Leave requests and their approval status appear here.'
            }
            action={
              can('LEAVE', 'CREATE') && (
                <Button onClick={() => setIsApplyOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  Apply for leave
                </Button>
              )
            }
          />
        }
      />

      <ApplyLeaveDialog open={isApplyOpen} onOpenChange={setIsApplyOpen} />

      <FormDialog
        open={reviewTarget !== null}
        onOpenChange={(open) => !open && setReviewTarget(null)}
        title="Review leave request"
        description={
          reviewTarget
            ? `${reviewTarget.applicant.firstName} ${reviewTarget.applicant.lastName} — ${reviewTarget.totalDays} day(s) of ${LEAVE_TYPE_LABELS[reviewTarget.type].toLowerCase()} leave, ${formatDate(reviewTarget.fromDate)} to ${formatDate(reviewTarget.toDate)}.`
            : undefined
        }
        formId={REVIEW_FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={decision === 'APPROVED' ? 'Approve leave' : 'Reject request'}
      >
        <Form {...form}>
          <form
            id={REVIEW_FORM_ID}
            className="space-y-5"
            noValidate
            onSubmit={form.handleSubmit(async (values) => {
              await reviewMutation.mutateAsync(values).catch(() => undefined);
            })}
          >
            {reviewTarget && (
              <p className="text-muted-foreground text-sm">Reason given: {reviewTarget.reason}</p>
            )}

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Decision</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="APPROVED">
                        <Check className="size-4" aria-hidden />
                        Approve
                      </SelectItem>
                      <SelectItem value="REJECTED">
                        <X className="size-4" aria-hidden />
                        Reject
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reviewComment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comment</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Shown to the applicant" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>

      <ConfirmDialog
        open={cancelTarget.isOpen}
        onOpenChange={cancelTarget.onOpenChange}
        title="Cancel this leave request?"
        description={
          <>
            The request for{' '}
            <strong>
              {cancelTarget.target ? formatDate(cancelTarget.target.fromDate) : ''} –{' '}
              {cancelTarget.target ? formatDate(cancelTarget.target.toDate) : ''}
            </strong>{' '}
            will be withdrawn. Approved days are returned to your balance.
          </>
        }
        confirmLabel="Cancel request"
        variant="destructive"
        onConfirm={async () => {
          if (cancelTarget.target) {
            await cancelMutation.mutateAsync(cancelTarget.target);
          }
        }}
      />
    </>
  );
}
