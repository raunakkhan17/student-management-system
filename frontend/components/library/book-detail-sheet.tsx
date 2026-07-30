'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, QrCode } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { formatCurrency, formatDate } from '@/lib/format';
import { libraryService } from '@/services/library.service';
import { BOOK_CONDITION_LABELS, BOOK_COPY_STATUS_LABELS } from '@/types/library';

interface BookDetailSheetProps {
  bookId: string | null;
  onOpenChange: (open: boolean) => void;
}

interface QrTarget {
  accessionNumber: string;
  dataUrl: string;
}

/** Read-only holdings view: every copy, its shelf, status and reservations. */
export function BookDetailSheet({ bookId, onOpenChange }: BookDetailSheetProps) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [qrTarget, setQrTarget] = useState<QrTarget | null>(null);

  const query = useQuery({
    queryKey: ['library', 'books', bookId],
    queryFn: () => libraryService.getBook(bookId as string),
    enabled: bookId !== null,
  });

  const qrMutation = useMutation({
    mutationFn: (copy: { id: string; accessionNumber: string }) =>
      libraryService
        .getCopyQrCode(copy.id)
        .then((result) => ({ accessionNumber: copy.accessionNumber, dataUrl: result.dataUrl })),
    onSuccess: (result) => setQrTarget(result),
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not generate the QR code');
    },
  });

  const cancelReservation = useMutation({
    mutationFn: (id: string) => libraryService.cancelReservation(id),
    onSuccess: async () => {
      toast.success('Reservation cancelled');
      await queryClient.invalidateQueries({ queryKey: ['library'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not cancel the reservation');
    },
  });

  const book = query.data;

  return (
    <>
      <Sheet open={bookId !== null} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="pr-8">{book?.title ?? 'Holdings'}</SheetTitle>
            <SheetDescription>
              {book
                ? [
                    book.isbn,
                    book.authors.map((link) => link.author.name).join(', ') || null,
                    book.publisher?.name ?? null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Loading the title…'}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="space-y-6 px-4 pb-6">
              {query.isLoading && (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              )}

              {query.error && (
                <ErrorState error={query.error} onRetry={() => void query.refetch()} />
              )}

              {book && (
                <>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Category</dt>
                      <dd className="font-medium">{book.category.name}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Language</dt>
                      <dd className="font-medium">{book.language}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Edition</dt>
                      <dd className="font-medium">{book.edition ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Published</dt>
                      <dd className="font-medium">{book.publishYear ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Copies</dt>
                      <dd className="font-medium">
                        {book.availableCopies} of {book.totalCopies} available
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Pages</dt>
                      <dd className="font-medium">{book.pages ?? '—'}</dd>
                    </div>
                  </dl>

                  {book.description && (
                    <p className="text-muted-foreground text-sm">{book.description}</p>
                  )}

                  <Separator />

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Copies</h3>

                    {book.copies.length === 0 ? (
                      <EmptyState
                        icon={BookOpen}
                        title="No copies registered"
                        description="Register physical copies before this title can be issued."
                      />
                    ) : (
                      <ul className="divide-y rounded-lg border">
                        {book.copies.map((copy) => (
                          <li
                            key={copy.id}
                            className="flex flex-wrap items-center justify-between gap-3 p-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">{copy.accessionNumber}</p>
                              <p className="text-muted-foreground truncate text-sm">
                                {copy.shelf ? `${copy.shelf.code} · ${copy.shelf.name}` : 'Unshelved'}
                                {' · '}
                                {BOOK_CONDITION_LABELS[copy.condition]}
                                {copy.price ? ` · ${formatCurrency(copy.price)}` : ''}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <StatusBadge
                                status={copy.status}
                                label={BOOK_COPY_STATUS_LABELS[copy.status]}
                              />
                              {can('LIBRARY', 'VIEW') && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  aria-label={`Print label for ${copy.accessionNumber}`}
                                  disabled={qrMutation.isPending}
                                  onClick={() =>
                                    qrMutation.mutate({
                                      id: copy.id,
                                      accessionNumber: copy.accessionNumber,
                                    })
                                  }
                                >
                                  <QrCode className="size-4" aria-hidden />
                                </Button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {book.reservations.length > 0 && (
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold">Reservation queue</h3>
                      <ul className="divide-y rounded-lg border">
                        {book.reservations.map((reservation, index) => (
                          <li
                            key={reservation.id}
                            className="flex flex-wrap items-center justify-between gap-3 p-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                <Badge variant="secondary" className="mr-2">
                                  #{index + 1}
                                </Badge>
                                {reservation.user.firstName} {reservation.user.lastName}
                              </p>
                              <p className="text-muted-foreground truncate text-sm">
                                Reserved {formatDate(reservation.reservedAt)} · holds until{' '}
                                {formatDate(reservation.expiresAt)}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <StatusBadge status={reservation.status} />
                              {can('LIBRARY', 'EDIT') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={cancelReservation.isPending}
                                  onClick={() => cancelReservation.mutate(reservation.id)}
                                >
                                  Cancel
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

      <Dialog open={qrTarget !== null} onOpenChange={(open) => !open && setQrTarget(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Spine label</DialogTitle>
            <DialogDescription>{qrTarget?.accessionNumber}</DialogDescription>
          </DialogHeader>

          {qrTarget && (
            <div className="flex flex-col items-center gap-4">
              {/* A runtime-generated data URI, so `next/image` optimization
                  does not apply. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrTarget.dataUrl}
                alt={`QR code for copy ${qrTarget.accessionNumber}`}
                width={240}
                height={240}
                className="rounded-md border bg-white p-2"
              />
              <Button variant="outline" onClick={() => window.print()} className="w-full">
                Print
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
