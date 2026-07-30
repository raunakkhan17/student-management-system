'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Clock, NotebookPen, Paperclip, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useTableState } from '@/hooks/use-table-state';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { academicService } from '@/services/academic.service';
import { assignmentService } from '@/services/assignment.service';
import {
  ASSIGNMENT_STATUS_LABELS,
  type AssignmentListItem,
  type AssignmentStatus,
} from '@/types/assignment';

const ALL = '__all__';
const STATUSES: AssignmentStatus[] = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'];

export function AssignmentsList() {
  const router = useRouter();
  const { can, hasRole } = useAuth();
  const table = useTableState({ defaultSortBy: 'dueDate', defaultSortOrder: 'desc' });

  const [classFilter, setClassFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const isStudent = hasRole('STUDENT');
  const canCreate = can('ASSIGNMENTS', 'CREATE') && !isStudent;

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
    enabled: !isStudent,
  });

  const params = {
    ...table.queryParams,
    ...(classFilter !== ALL ? { classId: classFilter } : {}),
    ...(statusFilter !== ALL ? { status: statusFilter } : {}),
  };

  const query = useQuery({
    queryKey: ['assignments', params],
    queryFn: () => assignmentService.list(params),
  });

  const statsQuery = useQuery({
    queryKey: ['assignments', 'stats'],
    queryFn: () => assignmentService.getStats(),
  });

  const isFiltered =
    table.state.search.length > 0 || classFilter !== ALL || statusFilter !== ALL;

  const columns = useMemo<ColumnDef<AssignmentListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Assignment',
        meta: { sortKey: 'title' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{row.original.title}</p>
              {row.original.attachments.length > 0 && (
                <Paperclip className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
              )}
            </div>
            <p className="text-muted-foreground truncate text-sm">
              {row.original.subject.name} · {row.original.class.name}
              {row.original.section ? ` — ${row.original.section.name}` : ''}
            </p>
          </div>
        ),
      },
      ...(isStudent
        ? []
        : [
            {
              id: 'teacher',
              header: 'Set by',
              meta: { hideOnMobile: true },
              cell: ({ row }) =>
                `${row.original.teacher.user.firstName} ${row.original.teacher.user.lastName}`,
            } satisfies ColumnDef<AssignmentListItem, unknown>,
          ]),
      {
        accessorKey: 'dueDate',
        header: 'Due',
        meta: { sortKey: 'dueDate' },
        cell: ({ row }) => {
          const due = new Date(row.original.dueDate);
          const isOverdue = due.getTime() < Date.now() && row.original.status === 'PUBLISHED';

          return (
            <div className="min-w-0">
              <p className={cn('truncate text-sm', isOverdue && 'text-destructive font-medium')}>
                {formatDateTime(row.original.dueDate)}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {formatRelative(row.original.dueDate)}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: 'maxMarks',
        header: 'Marks',
        meta: { hideOnMobile: true, cellClassName: 'tabular-nums' },
        cell: ({ row }) => Number(row.original.maxMarks),
      },
      ...(isStudent
        ? []
        : [
            {
              id: 'submissions',
              header: 'Submissions',
              meta: { hideOnMobile: true },
              cell: ({ row }) => (
                <Badge variant="secondary">{row.original._count.submissions}</Badge>
              ),
            } satisfies ColumnDef<AssignmentListItem, unknown>,
          ]),
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            label={ASSIGNMENT_STATUS_LABELS[row.original.status]}
          />
        ),
      },
    ],
    [isStudent],
  );

  return (
    <div>
      <PageHeader
        title="Assignments"
        description={
          isStudent
            ? 'Work set for your class, with deadlines and your submission status.'
            : 'Create, publish and evaluate assignments for the classes you teach.'
        }
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Assignments' }]}
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/assignments/new">
                <Plus className="size-4" aria-hidden />
                New assignment
              </Link>
            </Button>
          )
        }
      />

      {!isStudent && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total"
            value={statsQuery.data?.total ?? 0}
            icon={NotebookPen}
            tone="primary"
            isLoading={statsQuery.isLoading}
          />
          <StatCard
            label="Published"
            value={statsQuery.data?.published ?? 0}
            icon={CheckCircle2}
            tone="success"
            isLoading={statsQuery.isLoading}
          />
          <StatCard
            label="Awaiting marking"
            value={statsQuery.data?.awaitingEvaluation ?? 0}
            icon={Clock}
            tone="warning"
            isLoading={statsQuery.isLoading}
          />
          <StatCard
            label="Past due"
            value={statsQuery.data?.overdue ?? 0}
            icon={AlertTriangle}
            tone="danger"
            isLoading={statsQuery.isLoading}
          />
        </div>
      )}

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
        onRowClick={(row) => router.push(`/assignments/${row.id}`)}
        toolbar={
          <DataTableToolbar
            search={table.state.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Search by title or subject…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setClassFilter(ALL);
              setStatusFilter(ALL);
            }}
            filters={
              <>
                {!isStudent && (
                  <Select value={classFilter} onValueChange={setClassFilter}>
                    <SelectTrigger className="w-[10rem]" aria-label="Filter by class">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All classes</SelectItem>
                      {(classOptions.data ?? []).map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[9.5rem]" aria-label="Filter by status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {ASSIGNMENT_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
          />
        }
        emptyState={
          <EmptyState
            icon={NotebookPen}
            title={isFiltered ? 'No matching assignments' : 'No assignments yet'}
            description={
              isFiltered
                ? 'Try clearing the filters.'
                : isStudent
                  ? 'Nothing has been set for your class yet.'
                  : 'Create an assignment for one of the classes you teach.'
            }
            action={
              !isFiltered &&
              canCreate && (
                <Button asChild>
                  <Link href="/assignments/new">
                    <Plus className="size-4" aria-hidden />
                    New assignment
                  </Link>
                </Button>
              )
            }
          />
        }
      />
    </div>
  );
}
