'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Paperclip, Pin, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/error-state';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { appConfig } from '@/lib/config';
import { fileUrl } from '@/lib/download';
import { formatDateTime, formatFileSize } from '@/lib/format';
import { noticeService } from '@/services/notice.service';
import { ROLE_LABELS } from '@/types/enums';
import { PRIORITY_LABELS } from '@/types/hostel';
import { NOTICE_CATEGORY_LABELS, NOTICE_STATUS_LABELS } from '@/types/notice';

interface NoticeDetailSheetProps {
  noticeId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function NoticeDetailSheet({ noticeId, onOpenChange }: NoticeDetailSheetProps) {
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notices', 'detail', noticeId],
    queryFn: () => noticeService.get(noticeId as string),
    enabled: noticeId !== null,
  });

  const notice = query.data;

  const markRead = useMutation({
    mutationFn: (id: string) => noticeService.markRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notices'] });
    },
  });

  // Opening a notice is what marks it read, matching how a physical board works.
  useEffect(() => {
    if (!notice || notice.isRead) return;
    markRead.mutate(notice.id);
    // `markRead` is a stable mutation object; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice?.id, notice?.isRead]);

  const removeAttachment = useMutation({
    mutationFn: ({ id, fileId }: { id: string; fileId: string }) =>
      noticeService.removeAttachment(id, fileId),
    onSuccess: async () => {
      toast.success('Attachment removed');
      await queryClient.invalidateQueries({ queryKey: ['notices'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove the attachment');
    },
  });

  const audienceLabels = (notice?.audiences ?? []).map((rule) => {
    if (rule.role) return ROLE_LABELS[rule.role];
    if (rule.class) return rule.class.name;
    if (rule.section) return rule.section.name;
    return 'Everyone';
  });

  return (
    <Sheet open={noticeId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="pr-8">{notice?.title ?? 'Notice'}</SheetTitle>
          <SheetDescription>
            {notice
              ? `${NOTICE_CATEGORY_LABELS[notice.category]} · ${
                  notice.publishAt ? formatDateTime(notice.publishAt) : 'Not yet published'
                }`
              : 'Loading the notice…'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-6 px-4 pb-6">
            {query.isLoading && (
              <div className="space-y-3">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-40 w-full" />
              </div>
            )}

            {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}

            {notice && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    status={notice.status}
                    label={NOTICE_STATUS_LABELS[notice.status]}
                  />
                  <StatusBadge
                    status={notice.priority}
                    label={PRIORITY_LABELS[notice.priority]}
                  />
                  {notice.isPinned && (
                    <Badge variant="secondary" className="gap-1">
                      <Pin className="size-3" aria-hidden />
                      Pinned
                    </Badge>
                  )}
                </div>

                <p className="text-sm whitespace-pre-wrap">{notice.content}</p>

                <Separator />

                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Posted by</dt>
                    <dd className="font-medium">
                      {notice.createdBy
                        ? `${notice.createdBy.firstName} ${notice.createdBy.lastName}`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Expires</dt>
                    <dd className="font-medium">
                      {notice.expiresAt ? formatDateTime(notice.expiresAt) : 'No expiry'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Audience</dt>
                    <dd className="font-medium">
                      {audienceLabels.length > 0 ? audienceLabels.join(', ') : 'Everyone'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Read by</dt>
                    <dd className="font-medium tabular-nums">{notice._count.reads} person(s)</dd>
                  </div>
                </dl>

                {notice.attachments.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Attachments</h3>
                    <ul className="divide-y rounded-lg border">
                      {notice.attachments.map((attachment) => (
                        <li
                          key={attachment.id}
                          className="flex items-center justify-between gap-3 p-3"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Paperclip
                              className="text-muted-foreground size-4 shrink-0"
                              aria-hidden
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {attachment.file.originalName}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {formatFileSize(attachment.file.sizeBytes)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="size-8" asChild>
                              <a
                                href={fileUrl(appConfig.apiUrl, attachment.fileId, true)}
                                aria-label={`Download ${attachment.file.originalName}`}
                              >
                                <Download className="size-4" aria-hidden />
                              </a>
                            </Button>

                            {can('NOTICES', 'EDIT') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive size-8"
                                aria-label={`Remove ${attachment.file.originalName}`}
                                disabled={removeAttachment.isPending}
                                onClick={() =>
                                  removeAttachment.mutate({
                                    id: notice.id,
                                    fileId: attachment.fileId,
                                  })
                                }
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
