'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ApiError } from '@/lib/api-client';
import { messageService } from '@/services/message.service';
import { NOTIFICATION_TYPE_LABELS, type NotificationPreference } from '@/types/message';

interface NotificationSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Per-type in-app and email switches, as required by PRD Module 16. */
export function NotificationSettingsDialog({
  open,
  onOpenChange,
}: NotificationSettingsDialogProps) {
  const queryClient = useQueryClient();
  // Only the switches the user actually touched, keyed by type. Everything else
  // is read straight from the server, so no effect has to mirror the response.
  const [edits, setEdits] = useState<Record<string, Partial<NotificationPreference>>>({});

  const query = useQuery({
    queryKey: ['messages', 'notification-settings'],
    queryFn: () => messageService.getNotificationSettings(),
    enabled: open,
  });

  const draft: NotificationPreference[] = (query.data ?? []).map((preference) => ({
    ...preference,
    ...edits[preference.type],
  }));

  const mutation = useMutation({
    mutationFn: () => messageService.saveNotificationSettings(draft),
    onSuccess: async () => {
      toast.success('Notification settings saved');
      setEdits({});
      await queryClient.invalidateQueries({ queryKey: ['messages', 'notification-settings'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not save the settings');
    },
  });

  const toggle = (type: string, field: 'inAppEnabled' | 'emailEnabled', value: boolean) => {
    setEdits((current) => ({ ...current, [type]: { ...current[type], [field]: value } }));
  };

  return (
    <Dialog open={open} onOpenChange={mutation.isPending ? undefined : onOpenChange}>
      <DialogContent className="max-h-[90svh] gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Notification settings</DialogTitle>
          <DialogDescription>
            Choose how you hear about each kind of update. Email needs SMTP configured.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90svh-9.5rem)]">
          <div className="px-6 py-5">
            {query.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : query.error ? (
              <ErrorState error={query.error} onRetry={() => void query.refetch()} size="compact" />
            ) : (
              <div className="space-y-1">
                <div className="text-muted-foreground grid grid-cols-[1fr_4rem_4rem] gap-2 pb-2 text-xs font-medium">
                  <span>Type</span>
                  <span className="text-center">In app</span>
                  <span className="text-center">Email</span>
                </div>

                {draft.map((preference) => (
                  <div
                    key={preference.type}
                    className="grid grid-cols-[1fr_4rem_4rem] items-center gap-2 border-t py-2.5"
                  >
                    <span className="text-sm">{NOTIFICATION_TYPE_LABELS[preference.type]}</span>

                    <div className="flex justify-center">
                      <Switch
                        checked={preference.inAppEnabled}
                        aria-label={`${NOTIFICATION_TYPE_LABELS[preference.type]} in app`}
                        onCheckedChange={(value) =>
                          toggle(preference.type, 'inAppEnabled', value)
                        }
                      />
                    </div>

                    <div className="flex justify-center">
                      <Switch
                        checked={preference.emailEnabled}
                        aria-label={`${NOTIFICATION_TYPE_LABELS[preference.type]} by email`}
                        onCheckedChange={(value) =>
                          toggle(preference.type, 'emailEnabled', value)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || draft.length === 0}
          >
            {mutation.isPending ? 'Saving…' : 'Save settings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
