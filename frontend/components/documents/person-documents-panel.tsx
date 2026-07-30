'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Download, FileText, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { appConfig } from '@/lib/config';
import { fileUrl } from '@/lib/download';
import { formatDate, formatFileSize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { documentService } from '@/services/document.service';
import {
  DOCUMENT_TYPE_LABELS,
  VERIFICATION_STATUS_LABELS,
  type StudentDocument,
} from '@/types/document';
import { UploadDocumentDialog } from './upload-document-dialog';

interface PersonDocumentsPanelProps {
  /** Exactly one of these identifies whose documents to show. */
  studentId?: string;
  teacherId?: string;
}

/** The documents belonging to one student or one member of staff. */
export function PersonDocumentsPanel({ studentId, teacherId }: PersonDocumentsPanelProps) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  // Read once on mount rather than on every render, so expiry styling stays
  // stable and the render itself has no clock dependency.
  const [renderedAt] = useState(() => Date.now());
  const deleteTarget = useConfirmTarget<StudentDocument>();

  const query = useQuery({
    queryKey: ['documents', 'person', studentId ?? teacherId],
    queryFn: () =>
      documentService.list({
        limit: 100,
        ...(studentId ? { studentId } : {}),
        ...(teacherId ? { teacherId } : {}),
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => documentService.remove(id),
    onSuccess: async () => {
      toast.success('Document removed');
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove the document');
    },
  });

  const documents = query.data?.items ?? [];

  return (
    <>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Documents</h3>
              <p className="text-muted-foreground text-sm">
                Certificates, proofs and records held on file.
              </p>
            </div>

            {can('DOCUMENTS', 'CREATE') && (
              <Button variant="outline" size="sm" onClick={() => setIsUploadOpen(true)}>
                <Upload className="size-4" aria-hidden />
                Upload
              </Button>
            )}
          </div>

          {query.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : query.error ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} size="compact" />
          ) : documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents on file"
              description="Upload certificates and identity proofs for verification."
              size="compact"
              action={
                can('DOCUMENTS', 'CREATE') && (
                  <Button variant="outline" size="sm" onClick={() => setIsUploadOpen(true)}>
                    <Upload className="size-4" aria-hidden />
                    Upload document
                  </Button>
                )
              }
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {documents.map((document) => {
                const hasLapsed =
                  document.expiryDate !== null &&
                  new Date(document.expiryDate).getTime() < renderedAt;

                return (
                  <li
                    key={document.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{document.title}</p>
                      <p className="text-muted-foreground truncate text-sm">
                        {document.file.originalName} · {formatFileSize(document.file.sizeBytes)}
                        {document.expiryDate && (
                          <span className={cn('ml-1', hasLapsed && 'text-destructive font-medium')}>
                            · {hasLapsed ? 'expired' : 'expires'} {formatDate(document.expiryDate)}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{DOCUMENT_TYPE_LABELS[document.type]}</Badge>
                      <StatusBadge
                        status={document.status}
                        label={VERIFICATION_STATUS_LABELS[document.status]}
                      />

                      {document.status === 'VERIFIED' && (
                        <BadgeCheck className="text-success size-4" aria-hidden />
                      )}

                      <Button variant="ghost" size="icon" className="size-8" asChild>
                        <a
                          href={fileUrl(appConfig.apiUrl, document.fileId, true)}
                          aria-label={`Download ${document.title}`}
                        >
                          <Download className="size-4" aria-hidden />
                        </a>
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive size-8"
                        aria-label={`Remove ${document.title}`}
                        onClick={() => deleteTarget.open(document)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <UploadDocumentDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        {...(studentId ? { fixedStudentId: studentId } : {})}
        {...(teacherId ? { fixedTeacherId: teacherId } : {})}
      />

      <ConfirmDialog
        open={deleteTarget.isOpen}
        onOpenChange={deleteTarget.onOpenChange}
        title="Remove this document?"
        description={
          <>
            <strong>{deleteTarget.target?.title}</strong> and its stored file will be deleted.
          </>
        }
        confirmLabel="Remove document"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget.target) {
            await deleteMutation.mutateAsync(deleteTarget.target.id);
          }
        }}
      />
    </>
  );
}
