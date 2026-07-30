'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRightLeft, Check, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
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
import { applyApiErrors } from '@/lib/form-errors';
import { formatDate } from '@/lib/format';
import { hostelService } from '@/services/hostel.service';
import type { RequestStatus, RoomTransfer } from '@/types/hostel';

const ALL = '__all__';
const FORM_ID = 'review-transfer-form';
const STATUSES: RequestStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

const reviewFormSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewComment: z.string().trim().max(500).optional(),
  effectiveDate: z.string().optional(),
});

type ReviewFormValues = z.infer<typeof reviewFormSchema>;

export function TransfersTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const table = useTableState({ defaultSortBy: 'requestedAt', defaultSortOrder: 'desc' });

  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [reviewTarget, setReviewTarget] = useState<RoomTransfer | null>(null);

  const params = {
    ...table.queryParams,
    ...(statusFilter !== ALL ? { status: statusFilter as RequestStatus } : {}),
  };

  const query = useQuery({
    queryKey: ['hostel', 'transfers', params],
    queryFn: () => hostelService.listTransfers(params),
  });

  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: { status: 'APPROVED', reviewComment: '', effectiveDate: '' },
  });

  useEffect(() => {
    if (!reviewTarget) return;
    form.reset({ status: 'APPROVED', reviewComment: '', effectiveDate: '' });
  }, [reviewTarget, form]);

  const mutation = useMutation({
    mutationFn: (values: ReviewFormValues) => {
      if (!reviewTarget) throw new Error('No request selected');
      return hostelService.reviewTransfer(reviewTarget.id, {
        status: values.status,
        ...(values.reviewComment ? { reviewComment: values.reviewComment } : {}),
        ...(values.effectiveDate ? { effectiveDate: values.effectiveDate } : {}),
      });
    },
    onSuccess: async (transfer) => {
      toast.success(
        transfer.status === 'APPROVED'
          ? 'Transfer approved and applied'
          : 'Transfer request rejected',
      );
      await queryClient.invalidateQueries({ queryKey: ['hostel'] });
      setReviewTarget(null);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not review the request');
    },
  });

  const onSubmit = async (values: ReviewFormValues) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, ['status', 'reviewComment', 'effectiveDate']);
    }
  };

  const isFiltered = table.state.search.length > 0 || statusFilter !== 'PENDING';

  const columns = useMemo<ColumnDef<RoomTransfer, unknown>[]>(
    () => [
      {
        id: 'student',
        header: 'Student',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">
              {row.original.student.user.firstName} {row.original.student.user.lastName}
            </p>
            <p className="text-muted-foreground truncate text-sm">
              {row.original.student.admissionNumber}
            </p>
          </div>
        ),
      },
      {
        id: 'move',
        header: 'Move',
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate">
              {row.original.fromRoom.hostel.name} · {row.original.fromRoom.roomNumber}
            </span>
            <ArrowRightLeft className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
            <span className="truncate font-medium">
              {row.original.toRoom.hostel.name} · {row.original.toRoom.roomNumber}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'reason',
        header: 'Reason',
        meta: { hideOnMobile: true },
        cell: ({ row }) => (
          <p className="max-w-[18rem] truncate text-sm">{row.original.reason}</p>
        ),
      },
      {
        accessorKey: 'requestedAt',
        header: 'Requested',
        meta: { sortKey: 'requestedAt', hideOnMobile: true },
        cell: ({ row }) => formatDate(row.original.requestedAt),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: '',
        meta: { cellClassName: 'w-24' },
        cell: ({ row }) => {
          if (row.original.status !== 'PENDING' || !can('HOSTEL', 'APPROVE')) {
            return <span className="text-muted-foreground text-sm">—</span>;
          }

          const freeBeds = row.original.toRoom.capacity - row.original.toRoom.occupied;

          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReviewTarget(row.original)}
              disabled={freeBeds <= 0}
              title={freeBeds <= 0 ? 'The target room is full' : undefined}
            >
              Review
            </Button>
          );
        },
      },
    ],
    [can],
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
            searchPlaceholder="Search requests…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setStatusFilter('PENDING');
            }}
            filters={
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[10rem]" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All requests</SelectItem>
                  {STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0) + status.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        }
        emptyState={
          <EmptyState
            icon={ArrowRightLeft}
            title={isFiltered ? 'No matching requests' : 'No transfer requests'}
            description={
              isFiltered
                ? 'Try a different filter.'
                : 'Room change requests raised from the Residents tab appear here for approval.'
            }
          />
        }
      />

      <FormDialog
        open={reviewTarget !== null}
        onOpenChange={(open) => !open && setReviewTarget(null)}
        title="Review transfer request"
        description={
          reviewTarget
            ? `${reviewTarget.student.user.firstName} ${reviewTarget.student.user.lastName}: room ${reviewTarget.fromRoom.roomNumber} → ${reviewTarget.toRoom.roomNumber}.`
            : undefined
        }
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={decision === 'APPROVED' ? 'Approve and move' : 'Reject request'}
      >
        <Form {...form}>
          <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {reviewTarget && (
              <p className="text-muted-foreground text-sm">
                Reason given: {reviewTarget.reason}
              </p>
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

            {decision === 'APPROVED' && (
              <FormField
                control={form.control}
                name="effectiveDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective from</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormDescription>
                      Leave blank to move today. The old bed is released on the same date.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="reviewComment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comment</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="Shown to the student" />
                  </FormControl>
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
