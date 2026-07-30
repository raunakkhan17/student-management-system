'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Megaphone,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTablePagination } from '@/components/data-table/data-table-pagination';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { useTableState } from '@/hooks/use-table-state';
import { ApiError } from '@/lib/api-client';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { noticeService } from '@/services/notice.service';
import { PRIORITY_LABELS } from '@/types/hostel';
import {
  NOTICE_CATEGORY_LABELS,
  NOTICE_STATUS_LABELS,
  type Notice,
  type NoticeCategory,
  type NoticeStatus,
} from '@/types/notice';
import { AnnouncementDialog } from './announcement-dialog';
import { NoticeDetailSheet } from './notice-detail-sheet';
import { NoticeFormDialog } from './notice-form-dialog';

const ALL = '__all__';
/** Sentinel meaning "the user closed the sheet the deep link opened". */
const DISMISSED = '__dismissed__';
const CATEGORIES: NoticeCategory[] = [
  'ACADEMIC',
  'HOLIDAY',
  'EVENTS',
  'EMERGENCY',
  'EXAMINATION',
  'GENERAL',
];
const STATUSES: NoticeStatus[] = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'EXPIRED', 'ARCHIVED'];

export function NoticeBoard() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const table = useTableState({ defaultSortBy: 'publishAt', defaultSortOrder: 'desc' });

  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [readFilter, setReadFilter] = useState(ALL);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAnnounceOpen, setIsAnnounceOpen] = useState(false);
  // `null` means "follow the deep link"; an explicit choice overrides it, and
  // DISMISSED closes a sheet the link opened.
  const [opened, setOpened] = useState<string | null>(null);
  const deleteTarget = useConfirmTarget<Notice>();

  const canManage = can('NOTICES', 'CREATE');

  // A notification links straight to one notice, so open it on arrival.
  const detailId = opened === DISMISSED ? null : (opened ?? searchParams.get('highlight'));

  const params = {
    ...table.queryParams,
    ...(categoryFilter !== ALL ? { category: categoryFilter as NoticeCategory } : {}),
    ...(statusFilter !== ALL ? { status: statusFilter } : {}),
    ...(readFilter === 'unread' ? { onlyUnread: true } : {}),
    ...(readFilter === 'pinned' ? { onlyPinned: true } : {}),
  };

  const query = useQuery({
    queryKey: ['notices', 'list', params],
    queryFn: () => noticeService.list(params),
  });

  const stats = useQuery({
    queryKey: ['notices', 'stats'],
    queryFn: () => noticeService.getStats(),
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) =>
      noticeService.setPinned(id, isPinned),
    onSuccess: async (notice) => {
      toast.success(notice.isPinned ? 'Notice pinned' : 'Notice unpinned');
      await queryClient.invalidateQueries({ queryKey: ['notices'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not update the notice');
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => noticeService.publish(id, { silent: false }),
    onSuccess: async (notice) => {
      toast.success(
        notice.status === 'SCHEDULED' ? 'Notice scheduled' : 'Notice published and audience notified',
      );
      await queryClient.invalidateQueries({ queryKey: ['notices'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not publish the notice');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => noticeService.remove(id),
    onSuccess: async () => {
      toast.success('Notice removed');
      await queryClient.invalidateQueries({ queryKey: ['notices'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove the notice');
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: () => noticeService.runSchedule(),
    onSuccess: async (result) => {
      toast.success(
        `${result.published} notice(s) published, ${result.expired} expired`,
      );
      await queryClient.invalidateQueries({ queryKey: ['notices'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not run the schedule');
    },
  });

  const isFiltered =
    table.state.search.length > 0 ||
    categoryFilter !== ALL ||
    statusFilter !== ALL ||
    readFilter !== ALL;

  const notices = query.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Notices"
        description="Announcements, holidays, events and emergency messages."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Notices' }]}
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setIsAnnounceOpen(true)}>
                <Send className="size-4" aria-hidden />
                Announce
              </Button>
              <Button
                onClick={() => {
                  setEditing(null);
                  setIsFormOpen(true);
                }}
              >
                <Plus className="size-4" aria-hidden />
                New notice
              </Button>
            </>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Notices"
          value={stats.data?.total ?? 0}
          icon={Megaphone}
          tone="primary"
          isLoading={stats.isLoading}
        />
        <StatCard
          label="Unread"
          value={stats.data?.unread ?? 0}
          icon={Megaphone}
          tone="warning"
          isLoading={stats.isLoading}
        />
        <StatCard
          label="Pinned"
          value={stats.data?.pinned ?? 0}
          icon={Pin}
          tone="info"
          isLoading={stats.isLoading}
        />
        {canManage && (
          <StatCard
            label="Scheduled"
            value={stats.data?.scheduled ?? 0}
            icon={RefreshCw}
            tone="success"
            isLoading={stats.isLoading}
          />
        )}
      </div>

      <div className="space-y-4">
        <DataTableToolbar
          search={table.state.search}
          onSearchChange={table.setSearch}
          searchPlaceholder="Search notices…"
          isFiltered={isFiltered}
          onReset={() => {
            table.reset();
            setCategoryFilter(ALL);
            setStatusFilter(ALL);
            setReadFilter(ALL);
          }}
          filters={
            <>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[11rem]" aria-label="Filter by category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {NOTICE_CATEGORY_LABELS[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {canManage && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[10rem]" aria-label="Filter by status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {NOTICE_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={readFilter} onValueChange={setReadFilter}>
                <SelectTrigger className="w-[10rem]" aria-label="Filter by read state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Everything</SelectItem>
                  <SelectItem value="unread">Unread only</SelectItem>
                  <SelectItem value="pinned">Pinned only</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
          actions={
            canManage && (
              <Button
                variant="outline"
                disabled={scheduleMutation.isPending}
                onClick={() => scheduleMutation.mutate()}
              >
                <RefreshCw
                  className={cn('size-4', scheduleMutation.isPending && 'animate-spin')}
                  aria-hidden
                />
                Run schedule
              </Button>
            )
          }
        />

        {query.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-52 w-full" />
            <Skeleton className="h-52 w-full" />
            <Skeleton className="h-52 w-full" />
          </div>
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : notices.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={isFiltered ? 'No matching notices' : 'The board is empty'}
            description={
              isFiltered
                ? 'Try a different filter or search term.'
                : 'Published notices appear here, newest and pinned first.'
            }
            action={
              !isFiltered &&
              canManage && (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setIsFormOpen(true);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  New notice
                </Button>
              )
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {notices.map((notice) => (
              <Card
                key={notice.id}
                className={cn(
                  'cursor-pointer transition-shadow hover:shadow-md',
                  !notice.isRead && 'border-primary/50',
                )}
                onClick={() => setOpened(notice.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">
                        {notice.isPinned && (
                          <Pin className="text-primary mr-1 inline size-3.5" aria-hidden />
                        )}
                        {notice.title}
                      </CardTitle>
                      <CardDescription className="truncate">
                        {notice.publishAt
                          ? formatRelative(notice.publishAt)
                          : NOTICE_STATUS_LABELS[notice.status]}
                        {notice.createdBy
                          ? ` · ${notice.createdBy.firstName} ${notice.createdBy.lastName}`
                          : ''}
                      </CardDescription>
                    </div>

                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                            aria-label="Notice actions"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <MoreHorizontal className="size-4" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {notice.status !== 'PUBLISHED' && can('NOTICES', 'APPROVE') && (
                            <DropdownMenuItem
                              disabled={publishMutation.isPending}
                              onClick={() => publishMutation.mutate(notice.id)}
                            >
                              <Send className="size-4" aria-hidden />
                              Publish now
                            </DropdownMenuItem>
                          )}

                          {can('NOTICES', 'EDIT') && (
                            <>
                              <DropdownMenuItem
                                onClick={() =>
                                  pinMutation.mutate({
                                    id: notice.id,
                                    isPinned: !notice.isPinned,
                                  })
                                }
                              >
                                {notice.isPinned ? (
                                  <PinOff className="size-4" aria-hidden />
                                ) : (
                                  <Pin className="size-4" aria-hidden />
                                )}
                                {notice.isPinned ? 'Unpin' : 'Pin to top'}
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onClick={() => {
                                  setEditing(notice);
                                  setIsFormOpen(true);
                                }}
                              >
                                <Pencil className="size-4" aria-hidden />
                                Edit
                              </DropdownMenuItem>
                            </>
                          )}

                          {can('NOTICES', 'DELETE') && (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => deleteTarget.open(notice)}
                            >
                              <Trash2 className="size-4" aria-hidden />
                              Remove
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <p className="text-muted-foreground line-clamp-3 text-sm">{notice.content}</p>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {NOTICE_CATEGORY_LABELS[notice.category]}
                    </Badge>
                    <StatusBadge
                      status={notice.priority}
                      label={PRIORITY_LABELS[notice.priority]}
                    />
                    {canManage && notice.status !== 'PUBLISHED' && (
                      <StatusBadge
                        status={notice.status}
                        label={NOTICE_STATUS_LABELS[notice.status]}
                      />
                    )}
                    {!notice.isRead && <Badge>New</Badge>}
                  </div>

                  {notice.expiresAt && (
                    <p className="text-muted-foreground text-xs">
                      Expires {formatDateTime(notice.expiresAt)}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {query.data && query.data.pagination.totalPages > 1 && (
          <DataTablePagination
            pagination={query.data.pagination}
            onPageChange={table.setPage}
            onLimitChange={table.setLimit}
          />
        )}
      </div>

      <NoticeFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} notice={editing} />
      <AnnouncementDialog open={isAnnounceOpen} onOpenChange={setIsAnnounceOpen} />

      <NoticeDetailSheet
        noticeId={detailId}
        onOpenChange={(open) => {
          if (!open) setOpened(DISMISSED);
        }}
      />

      <ConfirmDialog
        open={deleteTarget.isOpen}
        onOpenChange={deleteTarget.onOpenChange}
        title="Remove this notice?"
        description={
          <>
            <strong>{deleteTarget.target?.title}</strong> will be taken off the board. People who
            were already notified keep their notification.
          </>
        }
        confirmLabel="Remove notice"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget.target) {
            await deleteMutation.mutateAsync(deleteTarget.target.id);
          }
        }}
      />
    </div>
  );
}
