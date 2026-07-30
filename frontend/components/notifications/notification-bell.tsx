'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { messageService } from '@/services/message.service';
import { NOTIFICATION_TYPE_LABELS } from '@/types/message';
import { NotificationSettingsDialog } from './notification-settings-dialog';

/** How often the badge re-checks. Long enough not to be chatty. */
const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const counts = useQuery({
    queryKey: ['messages', 'unread'],
    queryFn: () => messageService.getUnreadCounts(),
    enabled: isAuthenticated,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const notifications = useQuery({
    queryKey: ['messages', 'notifications', 'recent'],
    queryFn: () => messageService.listNotifications({ limit: 10 }),
    enabled: isAuthenticated && isOpen,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => messageService.markNotificationRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => messageService.markAllNotificationsRead(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });

  if (!isAuthenticated) return null;

  const unread = counts.data?.notifications ?? 0;
  const items = notifications.data?.items ?? [];

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          >
            <Bell className="size-5" aria-hidden />
            {unread > 0 && (
              <span
                className="bg-destructive text-destructive-foreground absolute top-1 right-1 grid min-w-4 place-items-center rounded-full px-1 text-[0.625rem] leading-4 font-medium"
                aria-hidden
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-[22rem] p-0">
          <div className="flex items-center justify-between gap-2 p-3">
            <p className="text-sm font-semibold">Notifications</p>

            <div className="flex items-center gap-1">
              {unread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={markAllRead.isPending}
                  onClick={() => markAllRead.mutate()}
                >
                  <CheckCheck className="size-3.5" aria-hidden />
                  Mark all read
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Notification settings"
                onClick={() => {
                  setIsOpen(false);
                  setIsSettingsOpen(true);
                }}
              >
                <Settings className="size-4" aria-hidden />
              </Button>
            </div>
          </div>

          <Separator />

          <ScrollArea className="max-h-96">
            {notifications.isLoading ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="Nothing new"
                description="Alerts about fees, exams, leave and messages appear here."
                size="compact"
              />
            ) : (
              <ul className="divide-y">
                {items.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      className={cn(
                        'hover:bg-muted/60 w-full p-3 text-left transition-colors',
                        !notification.isRead && 'bg-primary-muted/40',
                      )}
                      onClick={() => {
                        if (!notification.isRead) markRead.mutate(notification.id);
                        setIsOpen(false);
                        if (notification.link) router.push(notification.link);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium">{notification.title}</p>
                        {!notification.isRead && (
                          <span
                            className="bg-primary mt-1.5 size-2 shrink-0 rounded-full"
                            aria-label="Unread"
                          />
                        )}
                      </div>

                      <p className="text-muted-foreground line-clamp-2 text-xs">
                        {notification.body}
                      </p>

                      <div className="mt-1.5 flex items-center gap-2">
                        <Badge variant="secondary" className="text-[0.625rem]">
                          {NOTIFICATION_TYPE_LABELS[notification.type]}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          {formatRelative(notification.createdAt)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>

          <Separator />

          <div className="p-2">
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link href="/messages" onClick={() => setIsOpen(false)}>
                Open messages
              </Link>
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <NotificationSettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </>
  );
}
