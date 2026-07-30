'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, BellOff, Download, MessagesSquare, Paperclip, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { appConfig } from '@/lib/config';
import { fileUrl } from '@/lib/download';
import { formatDateTime, formatFileSize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { messageService } from '@/services/message.service';

interface ConversationThreadProps {
  conversationId: string | null;
}

function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function ConversationThread({ conversationId }: ConversationThreadProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const conversation = useQuery({
    queryKey: ['messages', 'conversation', conversationId],
    queryFn: () => messageService.getConversation(conversationId as string),
    enabled: conversationId !== null,
  });

  const messages = useQuery({
    queryKey: ['messages', 'thread', conversationId],
    queryFn: () => messageService.listMessages(conversationId as string, { limit: 50 }),
    enabled: conversationId !== null,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => messageService.markConversationRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['messages', 'conversations'] });
      await queryClient.invalidateQueries({ queryKey: ['messages', 'unread'] });
    },
  });

  // Opening a thread is what clears its unread badge.
  useEffect(() => {
    if (!conversationId) return;
    markRead.mutate(conversationId);
    // `markRead` is stable; including it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!conversationId) throw new Error('No conversation selected');

      const uploaded = files.length > 0 ? await messageService.uploadAttachments(files) : [];

      return messageService.sendMessage(conversationId, {
        body: draft,
        attachmentIds: uploaded.map((asset) => asset.id),
      });
    },
    onSuccess: async () => {
      setDraft('');
      setFiles([]);
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not send the message');
    },
  });

  const participationMutation = useMutation({
    mutationFn: (payload: { isArchived?: boolean; isMuted?: boolean }) =>
      messageService.updateParticipation(conversationId as string, payload),
    onSuccess: async (result) => {
      toast.success(
        result.isArchived ? 'Conversation archived' : result.isMuted ? 'Conversation muted' : 'Updated',
      );
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not update the conversation');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) =>
      messageService.deleteMessage(conversationId as string, messageId),
    onSuccess: async () => {
      toast.success('Message deleted');
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not delete the message');
    },
  });

  if (!conversationId) {
    return (
      <div className="grid h-full place-items-center">
        <EmptyState
          icon={MessagesSquare}
          title="No conversation selected"
          description="Choose a conversation on the left, or start a new one."
        />
      </div>
    );
  }

  const me = conversation.data?.participants.find(
    (participant) => participant.userId === user?.id,
  );
  const others = (conversation.data?.participants ?? []).filter(
    (participant) => participant.userId !== user?.id,
  );

  const title =
    conversation.data?.subject ??
    others.map((participant) => `${participant.user.firstName} ${participant.user.lastName}`).join(', ');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{title || 'Conversation'}</p>
          <p className="text-muted-foreground truncate text-sm">
            {others.length} participant(s)
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={me?.isMuted ? 'Unmute conversation' : 'Mute conversation'}
            disabled={participationMutation.isPending}
            onClick={() => participationMutation.mutate({ isMuted: !me?.isMuted })}
          >
            <BellOff className={cn('size-4', me?.isMuted && 'text-warning')} aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={me?.isArchived ? 'Unarchive conversation' : 'Archive conversation'}
            disabled={participationMutation.isPending}
            onClick={() => participationMutation.mutate({ isArchived: !me?.isArchived })}
          >
            <Archive className={cn('size-4', me?.isArchived && 'text-info')} aria-hidden />
          </Button>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {messages.isLoading && (
            <>
              <Skeleton className="h-16 w-2/3" />
              <Skeleton className="ml-auto h-16 w-2/3" />
              <Skeleton className="h-16 w-1/2" />
            </>
          )}

          {messages.error && (
            <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
          )}

          {messages.data?.items.map((message) => {
            const isMine = message.senderId === user?.id;

            return (
              <div
                key={message.id}
                className={cn('flex items-start gap-3', isMine && 'flex-row-reverse')}
              >
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="text-xs">
                    {initialsOf(message.sender.firstName, message.sender.lastName)}
                  </AvatarFallback>
                </Avatar>

                <div className={cn('min-w-0 max-w-[80%] space-y-1', isMine && 'items-end text-right')}>
                  <p className="text-muted-foreground text-xs">
                    {isMine
                      ? 'You'
                      : `${message.sender.firstName} ${message.sender.lastName}`}{' '}
                    · {formatDateTime(message.sentAt)}
                  </p>

                  <div
                    className={cn(
                      'inline-block rounded-lg px-3 py-2 text-left text-sm whitespace-pre-wrap',
                      isMine ? 'bg-primary text-primary-foreground' : 'bg-muted',
                    )}
                  >
                    {message.body}
                  </div>

                  {message.attachments.length > 0 && (
                    <ul className="space-y-1">
                      {message.attachments.map((attachment) => (
                        <li key={attachment.id}>
                          <a
                            href={fileUrl(appConfig.apiUrl, attachment.fileId, true)}
                            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs underline-offset-4 hover:underline"
                          >
                            <Download className="size-3" aria-hidden />
                            {attachment.file.originalName}
                            <span>({formatFileSize(attachment.file.sizeBytes)})</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}

                  {isMine && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive h-6 px-1.5 text-xs"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(message.id)}
                    >
                      <Trash2 className="size-3" aria-hidden />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {messages.data?.items.length === 0 && (
            <EmptyState
              icon={MessagesSquare}
              title="No messages yet"
              description="Send the first message in this thread."
              size="compact"
            />
          )}
        </div>
      </ScrollArea>

      <form
        className="space-y-2 border-t p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim().length > 0) sendMutation.mutate();
        }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a reply…"
          rows={3}
          aria-label="Reply"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="file"
            multiple
            className="max-w-xs"
            aria-label="Attach files"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />

          {files.length > 0 && (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
              <Paperclip className="size-3.5" aria-hidden />
              {files.length}
            </span>
          )}

          <Button
            type="submit"
            className="ml-auto"
            disabled={sendMutation.isPending || draft.trim().length === 0}
          >
            <Send className="size-4" aria-hidden />
            {sendMutation.isPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </form>
    </div>
  );
}
