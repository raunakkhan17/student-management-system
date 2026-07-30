'use client';

import { useQuery } from '@tanstack/react-query';
import { MessagesSquare, Plus, Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { messageService } from '@/services/message.service';
import { ComposeDialog } from './compose-dialog';
import { ConversationThread } from './conversation-thread';

type InboxFilter = 'inbox' | 'unread' | 'archived';

export function MessagesWorkspace() {
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<InboxFilter>('inbox');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);

  // A notification links straight to one thread; an explicit click wins over it.
  const selectedId = picked ?? searchParams.get('conversation');

  const query = useQuery({
    queryKey: ['messages', 'conversations', filter, debouncedSearch],
    queryFn: () =>
      messageService.listConversations({
        limit: 50,
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        ...(filter === 'archived' ? { includeArchived: true } : {}),
        ...(filter === 'unread' ? { onlyUnread: true } : {}),
      }),
  });

  const conversations = query.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Internal messaging with staff, students and parents."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Messages' }]}
        actions={
          <Button onClick={() => setIsComposeOpen(true)}>
            <Plus className="size-4" aria-hidden />
            New message
          </Button>
        }
      />

      <Card className="overflow-hidden p-0">
        <div className="grid min-h-[34rem] lg:grid-cols-[20rem_1fr]">
          <div className="flex min-h-0 flex-col border-b lg:border-r lg:border-b-0">
            <div className="space-y-3 border-b p-3">
              <div className="relative">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search conversations…"
                  className="pl-9"
                  type="search"
                  aria-label="Search conversations"
                />
              </div>

              <Tabs value={filter} onValueChange={(value) => setFilter(value as InboxFilter)}>
                <TabsList className="w-full">
                  <TabsTrigger value="inbox" className="flex-1">
                    Inbox
                  </TabsTrigger>
                  <TabsTrigger value="unread" className="flex-1">
                    Unread
                  </TabsTrigger>
                  <TabsTrigger value="archived" className="flex-1">
                    Archived
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              {query.isLoading ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : query.error ? (
                <ErrorState
                  error={query.error}
                  onRetry={() => void query.refetch()}
                  size="compact"
                />
              ) : conversations.length === 0 ? (
                <EmptyState
                  icon={MessagesSquare}
                  title={filter === 'unread' ? 'Nothing unread' : 'No conversations'}
                  description="Start a conversation to message someone directly."
                  size="compact"
                />
              ) : (
                <ul className="divide-y">
                  {conversations.map((conversation) => {
                    const names = conversation.participants
                      .map((participant) => `${participant.firstName} ${participant.lastName}`)
                      .join(', ');
                    const first = conversation.participants[0];

                    return (
                      <li key={conversation.id}>
                        <button
                          type="button"
                          onClick={() => setPicked(conversation.id)}
                          className={cn(
                            'hover:bg-muted/60 flex w-full items-start gap-3 p-3 text-left transition-colors',
                            selectedId === conversation.id && 'bg-muted',
                          )}
                        >
                          <Avatar className="size-9 shrink-0">
                            <AvatarFallback className="text-xs">
                              {first
                                ? `${first.firstName.charAt(0)}${first.lastName.charAt(0)}`.toUpperCase()
                                : '??'}
                            </AvatarFallback>
                          </Avatar>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-medium">
                                {conversation.subject ?? (names || 'Conversation')}
                              </p>
                              {conversation.unreadCount > 0 && (
                                <Badge className="shrink-0">{conversation.unreadCount}</Badge>
                              )}
                            </div>

                            <p className="text-muted-foreground truncate text-xs">
                              {conversation.lastMessage?.body ?? 'No messages yet'}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {formatRelative(conversation.lastMessageAt)}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>

          {/* Keyed so switching threads remounts the composer, clearing any
              half-written reply and staged attachments. */}
          <ConversationThread key={selectedId ?? 'none'} conversationId={selectedId} />
        </div>
      </Card>

      <ComposeDialog
        open={isComposeOpen}
        onOpenChange={setIsComposeOpen}
        onSent={(conversationId) => setPicked(conversationId)}
      />
    </div>
  );
}
