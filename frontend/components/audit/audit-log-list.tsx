'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ScrollText, Search } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateTime } from '@/lib/format';
import { auditService } from '@/services/audit.service';
import type { AuditLogEntry } from '@/types/audit';
import { AppModule, AuditAction, AUDIT_ACTION_LABELS } from '@/types/enums';
import { AuditLogDetailSheet } from './audit-log-detail-sheet';

/** Actions that changed data, worth colouring apart from routine reads. */
const DESTRUCTIVE: AuditAction[] = ['DELETE', 'REJECT'];
const NOTABLE: AuditAction[] = ['CREATE', 'UPDATE', 'APPROVE', 'PUBLISH', 'RESTORE', 'ASSIGN'];

function actionVariant(action: AuditAction): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (DESTRUCTIVE.includes(action)) return 'destructive';
  if (NOTABLE.includes(action)) return 'default';
  return 'secondary';
}

const columns: ColumnDef<AuditLogEntry, unknown>[] = [
  {
    accessorKey: 'createdAt',
    header: 'When',
    meta: { sortKey: 'createdAt' },
    cell: ({ row }) => (
      <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>
    ),
  },
  {
    id: 'actor',
    header: 'Who',
    cell: ({ row }) => {
      const user = row.original.user;
      return (
        <div className="min-w-0">
          <p className="truncate font-medium">
            {user ? `${user.firstName} ${user.lastName}` : 'System'}
          </p>
          {user && <p className="text-muted-foreground truncate text-xs">{user.email}</p>}
        </div>
      );
    },
  },
  {
    accessorKey: 'action',
    header: 'Action',
    cell: ({ row }) => (
      <Badge variant={actionVariant(row.original.action)}>
        {AUDIT_ACTION_LABELS[row.original.action]}
      </Badge>
    ),
  },
  {
    accessorKey: 'module',
    header: 'Module',
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs tracking-wide uppercase">
        {row.original.module.replace(/_/g, ' ')}
      </span>
    ),
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => <span className="line-clamp-2">{row.original.description ?? '—'}</span>,
  },
  {
    accessorKey: 'ipAddress',
    header: 'IP address',
    meta: { hideOnMobile: true },
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs">{row.original.ipAddress ?? '—'}</span>
    ),
  },
];

export function AuditLogList() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('all');
  const [action, setAction] = useState('all');
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const query = useQuery({
    queryKey: ['audit-logs', { page, limit, search, module, action }],
    queryFn: () =>
      auditService.list({
        page,
        limit,
        ...(search ? { search } : {}),
        ...(module !== 'all' ? { module: module as AuditLogEntry['module'] } : {}),
        ...(action !== 'all' ? { action: action as AuditAction } : {}),
      }),
    // Hold the previous page while the next one loads — no skeleton flash.
    placeholderData: keepPreviousData,
  });

  /** Any filter change invalidates the current page number. */
  function resetTo(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every change recorded across the system, newest first."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Audit log' }]}
      />

      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        pagination={query.data?.pagination}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        getRowId={(row) => row.id}
        onRowClick={setSelected}
        onPageChange={setPage}
        onLimitChange={(next) => {
          setLimit(next);
          setPage(1);
        }}
        emptyState={
          <EmptyState
            icon={ScrollText}
            title="Nothing recorded"
            description="Actions taken in the system will appear here."
          />
        }
        toolbar={
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search
                className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search description, entity or person"
                className="pl-9"
                aria-label="Search the audit log"
              />
            </div>

            <Select value={module} onValueChange={resetTo(setModule)}>
              <SelectTrigger className="w-44" aria-label="Filter by module">
                <SelectValue placeholder="All modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                {Object.values(AppModule).map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={action} onValueChange={resetTo(setAction)}>
              <SelectTrigger className="w-40" aria-label="Filter by action">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {Object.values(AuditAction).map((value) => (
                  <SelectItem key={value} value={value}>
                    {AUDIT_ACTION_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <AuditLogDetailSheet
        entry={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
