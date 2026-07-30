'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  BadgeCheck,
  Clock,
  Download,
  FileText,
  MoreHorizontal,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { appConfig } from '@/lib/config';
import { fileUrl } from '@/lib/download';
import { formatDate, formatFileSize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { documentService } from '@/services/document.service';
import {
  DOCUMENT_TYPE_LABELS,
  VERIFICATION_STATUS_LABELS,
  type DocumentType,
  type StudentDocument,
  type VerificationStatus,
} from '@/types/document';
import { UploadDocumentDialog } from './upload-document-dialog';

const ALL = '__all__';
const VERIFY_FORM_ID = 'verify-document-form';
const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[];
const STATUSES: VerificationStatus[] = ['PENDING', 'VERIFIED', 'REJECTED'];

const verifyFormSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  remarks: z.string().trim().max(1000).optional(),
});

type VerifyFormValues = z.infer<typeof verifyFormSchema>;

export function DocumentsWorkspace() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const table = useTableState({ defaultSortBy: 'createdAt', defaultSortOrder: 'desc' });

  const [typeFilter, setTypeFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [expiryFilter, setExpiryFilter] = useState(ALL);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<StudentDocument | null>(null);
  const deleteTarget = useConfirmTarget<StudentDocument>();

  const params = {
    ...table.queryParams,
    ...(typeFilter !== ALL ? { type: typeFilter as DocumentType } : {}),
    ...(statusFilter !== ALL ? { status: statusFilter } : {}),
    ...(expiryFilter === 'soon' ? { expiringSoon: true } : {}),
  };

  const query = useQuery({
    queryKey: ['documents', 'list', params],
    queryFn: () => documentService.list(params),
  });

  const stats = useQuery({
    queryKey: ['documents', 'stats'],
    queryFn: () => documentService.getStats(),
  });

  const form = useForm<VerifyFormValues>({
    resolver: zodResolver(verifyFormSchema),
    defaultValues: { status: 'VERIFIED', remarks: '' },
  });

  useEffect(() => {
    if (!verifyTarget) return;
    form.reset({ status: 'VERIFIED', remarks: verifyTarget.remarks ?? '' });
  }, [verifyTarget, form]);

  const verifyMutation = useMutation({
    mutationFn: (values: VerifyFormValues) => {
      if (!verifyTarget) throw new Error('No document selected');
      return documentService.verify(verifyTarget.id, {
        status: values.status,
        ...(values.remarks ? { remarks: values.remarks } : {}),
      });
    },
    onSuccess: async (document) => {
      toast.success(document.status === 'VERIFIED' ? 'Document verified' : 'Document rejected');
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      setVerifyTarget(null);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not verify the document');
    },
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

  const isFiltered =
    table.state.search.length > 0 ||
    typeFilter !== ALL ||
    statusFilter !== ALL ||
    expiryFilter !== ALL;

  const columns = useMemo<ColumnDef<StudentDocument, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Document',
        meta: { sortKey: 'title' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.title}</p>
            <p className="text-muted-foreground truncate text-sm">
              {row.original.file.originalName} · {formatFileSize(row.original.file.sizeBytes)}
            </p>
          </div>
        ),
      },
      {
        id: 'owner',
        header: 'Belongs to',
        cell: ({ row }) => {
          const owner = row.original.student ?? row.original.teacher;
          if (!owner) return <span className="text-muted-foreground">Unassigned</span>;

          const identifier =
            row.original.student?.admissionNumber ?? row.original.teacher?.employeeId ?? '';

          return (
            <div className="min-w-0">
              <p className="truncate">
                {owner.user.firstName} {owner.user.lastName}
              </p>
              <p className="text-muted-foreground truncate text-sm">{identifier}</p>
            </div>
          );
        },
      },
      {
        accessorKey: 'type',
        header: 'Type',
        meta: { hideOnMobile: true },
        cell: ({ row }) => (
          <Badge variant="secondary">{DOCUMENT_TYPE_LABELS[row.original.type]}</Badge>
        ),
      },
      {
        accessorKey: 'expiryDate',
        header: 'Expiry',
        meta: { sortKey: 'expiryDate', hideOnMobile: true },
        cell: ({ row }) => {
          const expiry = row.original.expiryDate;
          if (!expiry) return <span className="text-muted-foreground">—</span>;

          const hasLapsed = new Date(expiry).getTime() < Date.now();

          return (
            <span className={cn(hasLapsed && 'text-destructive font-medium')}>
              {formatDate(expiry)}
            </span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            label={VERIFICATION_STATUS_LABELS[row.original.status]}
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        meta: { cellClassName: 'w-12' },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Row actions">
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={fileUrl(appConfig.apiUrl, row.original.fileId, true)}>
                  <Download className="size-4" aria-hidden />
                  Download
                </a>
              </DropdownMenuItem>

              {can('DOCUMENTS', 'APPROVE') && row.original.status === 'PENDING' && (
                <DropdownMenuItem onClick={() => setVerifyTarget(row.original)}>
                  <BadgeCheck className="size-4" aria-hidden />
                  Verify
                </DropdownMenuItem>
              )}

              <DropdownMenuItem variant="destructive" onClick={() => deleteTarget.open(row.original)}>
                <Trash2 className="size-4" aria-hidden />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [can, deleteTarget],
  );

  const decision = form.watch('status');

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Certificates, identity proofs, medical records and report cards."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Documents' }]}
        actions={
          can('DOCUMENTS', 'CREATE') && (
            <Button onClick={() => setIsUploadOpen(true)}>
              <Upload className="size-4" aria-hidden />
              Upload document
            </Button>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Documents"
          value={stats.data?.total ?? 0}
          icon={FileText}
          tone="primary"
          isLoading={stats.isLoading}
        />
        <StatCard
          label="Awaiting review"
          value={stats.data?.pending ?? 0}
          icon={Clock}
          tone="warning"
          isLoading={stats.isLoading}
        />
        <StatCard
          label="Verified"
          value={stats.data?.verified ?? 0}
          icon={BadgeCheck}
          tone="success"
          isLoading={stats.isLoading}
          hint={`${stats.data?.rejected ?? 0} rejected`}
        />
        <StatCard
          label="Expiring soon"
          value={stats.data?.expiring ?? 0}
          icon={ShieldAlert}
          tone="danger"
          isLoading={stats.isLoading}
          hint="Within 30 days"
        />
      </div>

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
            searchPlaceholder="Title, file name or owner…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setTypeFilter(ALL);
              setStatusFilter(ALL);
              setExpiryFilter(ALL);
            }}
            filters={
              <>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[12rem]" aria-label="Filter by type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All types</SelectItem>
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {DOCUMENT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[11rem]" aria-label="Filter by status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {VERIFICATION_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={expiryFilter} onValueChange={setExpiryFilter}>
                  <SelectTrigger className="w-[12rem]" aria-label="Filter by expiry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any expiry</SelectItem>
                    <SelectItem value="soon">Expiring within 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
          />
        }
        emptyState={
          <EmptyState
            icon={FileText}
            title={isFiltered ? 'No matching documents' : 'No documents yet'}
            description={
              isFiltered
                ? 'Try a different filter or search term.'
                : 'Upload certificates and proofs; an administrator verifies them.'
            }
            action={
              !isFiltered &&
              can('DOCUMENTS', 'CREATE') && (
                <Button onClick={() => setIsUploadOpen(true)}>
                  <Upload className="size-4" aria-hidden />
                  Upload document
                </Button>
              )
            }
          />
        }
      />

      <UploadDocumentDialog open={isUploadOpen} onOpenChange={setIsUploadOpen} />

      <FormDialog
        open={verifyTarget !== null}
        onOpenChange={(open) => !open && setVerifyTarget(null)}
        title="Verify document"
        description={
          verifyTarget
            ? `${verifyTarget.title} — ${DOCUMENT_TYPE_LABELS[verifyTarget.type]}.`
            : undefined
        }
        formId={VERIFY_FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={decision === 'VERIFIED' ? 'Mark verified' : 'Reject document'}
      >
        <Form {...form}>
          <form
            id={VERIFY_FORM_ID}
            className="space-y-5"
            noValidate
            onSubmit={form.handleSubmit(async (values) => {
              await verifyMutation.mutateAsync(values).catch(() => undefined);
            })}
          >
            {verifyTarget && (
              <Button variant="outline" className="w-full" asChild>
                <a href={fileUrl(appConfig.apiUrl, verifyTarget.fileId, true)}>
                  <Download className="size-4" aria-hidden />
                  Open the file first
                </a>
              </Button>
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
                      <SelectItem value="VERIFIED">Verify</SelectItem>
                      <SelectItem value="REJECTED">Reject</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remarks</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Shown to the document owner" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>

      <ConfirmDialog
        open={deleteTarget.isOpen}
        onOpenChange={deleteTarget.onOpenChange}
        title="Remove this document?"
        description={
          <>
            <strong>{deleteTarget.target?.title}</strong> and its stored file will be deleted. You
            can only remove your own submissions until they have been verified.
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
    </div>
  );
}
