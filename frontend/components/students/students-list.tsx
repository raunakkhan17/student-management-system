'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { Download, GraduationCap, MoreHorizontal, Plus, Upload, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useTableState } from '@/hooks/use-table-state';
import { ApiError } from '@/lib/api-client';
import { downloadBlob } from '@/lib/download';
import { formatDate } from '@/lib/format';
import { academicService } from '@/services/academic.service';
import { studentService } from '@/services/student.service';
import { STUDENT_STATUS_LABELS, type StudentStatus } from '@/types/enums';
import type { StudentListItem } from '@/types/student';
import { PromoteStudentsDialog } from './promote-students-dialog';

const ALL = '__all__';
const STATUSES: StudentStatus[] = [
  'ACTIVE',
  'INACTIVE',
  'GRADUATED',
  'TRANSFERRED',
  'ARCHIVED',
  'SUSPENDED',
];

export function StudentsList() {
  const router = useRouter();
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'admissionNumber', defaultSortOrder: 'asc' });

  const [classFilter, setClassFilter] = useState<string>(ALL);
  const [sectionFilter, setSectionFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isPromoteOpen, setIsPromoteOpen] = useState(false);

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
  });

  const sectionChoices = useMemo(
    () => classOptions.data?.find((option) => option.id === classFilter)?.sections ?? [],
    [classOptions.data, classFilter],
  );

  const params = {
    ...table.queryParams,
    ...(classFilter !== ALL ? { classId: classFilter } : {}),
    ...(sectionFilter !== ALL ? { sectionId: sectionFilter } : {}),
    ...(statusFilter !== ALL ? { status: statusFilter } : {}),
  };

  const query = useQuery({
    queryKey: ['students', params],
    queryFn: () => studentService.list(params),
  });

  const exportMutation = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') => studentService.exportStudents({ ...params, format }),
    onSuccess: (blob, format) => {
      downloadBlob(blob, `students-${new Date().toISOString().slice(0, 10)}.${format}`);
      toast.success('Export downloaded');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not export students');
    },
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const isFiltered =
    table.state.search.length > 0 ||
    classFilter !== ALL ||
    sectionFilter !== ALL ||
    statusFilter !== ALL;

  const resetAll = () => {
    table.reset();
    setClassFilter(ALL);
    setSectionFilter(ALL);
    setStatusFilter(ALL);
  };

  const columns: ColumnDef<StudentListItem, unknown>[] = [
    ...(can('STUDENTS', 'APPROVE')
      ? [
          {
            id: 'select',
            header: ({ table: t }) => (
              <Checkbox
                checked={t.getIsAllPageRowsSelected()}
                onCheckedChange={(value) => t.toggleAllPageRowsSelected(Boolean(value))}
                aria-label="Select all rows on this page"
              />
            ),
            cell: ({ row }) => (
              <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
                aria-label={`Select ${row.original.user.firstName}`}
                onClick={(event) => event.stopPropagation()}
              />
            ),
            meta: { cellClassName: 'w-10' },
          } satisfies ColumnDef<StudentListItem, unknown>,
        ]
      : []),
    {
      id: 'student',
      header: 'Student',
      meta: { sortKey: 'user.firstName' },
      cell: ({ row }) => {
        const { user, admissionNumber } = row.original;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-9 shrink-0">
              <AvatarFallback className="bg-primary-muted text-primary text-xs font-semibold">
                {`${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-muted-foreground truncate text-sm">{admissionNumber}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: 'placement',
      header: 'Class',
      cell: ({ row }) =>
        row.original.class ? (
          <span>
            {row.original.class.name}
            {row.original.section ? ` — ${row.original.section.name}` : ''}
          </span>
        ) : (
          <span className="text-muted-foreground">Unplaced</span>
        ),
    },
    {
      accessorKey: 'rollNumber',
      header: 'Roll no.',
      meta: { sortKey: 'rollNumber', hideOnMobile: true, cellClassName: 'tabular-nums' },
      cell: ({ row }) => row.original.rollNumber ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'guardian',
      header: 'Primary guardian',
      meta: { hideOnMobile: true },
      cell: ({ row }) => {
        const link = row.original.guardians[0];
        return link ? (
          <div className="min-w-0">
            <p className="truncate">
              {link.guardian.firstName} {link.guardian.lastName}
            </p>
            <p className="text-muted-foreground truncate text-sm">{link.guardian.phone}</p>
          </div>
        ) : (
          <span className="text-muted-foreground">Not linked</span>
        );
      },
    },
    {
      accessorKey: 'admissionDate',
      header: 'Admitted',
      meta: { sortKey: 'admissionDate', hideOnMobile: true },
      cell: ({ row }) => formatDate(row.original.admissionDate),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      meta: { sortKey: 'status' },
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'w-12' },
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Row actions"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenuItem asChild>
              <Link href={`/students/${row.original.id}`}>View profile</Link>
            </DropdownMenuItem>
            {can('STUDENTS', 'EDIT') && (
              <DropdownMenuItem asChild>
                <Link href={`/students/${row.original.id}?tab=personal&edit=1`}>Edit</Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/students/${row.original.id}/id-card`}>Generate ID card</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Students"
        description="Every student record, their placement, guardians and status."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Students' }]}
        actions={
          <>
            {can('STUDENTS', 'EXPORT') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={exportMutation.isPending}>
                    <Download className="size-4" aria-hidden />
                    {exportMutation.isPending ? 'Exporting…' : 'Export'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportMutation.mutate('xlsx')}>
                    Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportMutation.mutate('csv')}>
                    CSV (.csv)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {can('STUDENTS', 'APPROVE') && selectedIds.length > 0 && (
              <Button variant="outline" onClick={() => setIsPromoteOpen(true)}>
                <Upload className="size-4" aria-hidden />
                Promote ({selectedIds.length})
              </Button>
            )}

            {can('STUDENTS', 'CREATE') && (
              <Button asChild>
                <Link href="/students/new">
                  <UserPlus className="size-4" aria-hidden />
                  Admit student
                </Link>
              </Button>
            )}
          </>
        }
      />

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
        rowSelection={rowSelection}
        {...(can('STUDENTS', 'APPROVE') ? { onRowSelectionChange: setRowSelection } : {})}
        onRowClick={(row) => router.push(`/students/${row.id}`)}
        toolbar={
          <DataTableToolbar
            search={table.state.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Name, admission no., email or phone…"
            isFiltered={isFiltered}
            onReset={resetAll}
            filters={
              <>
                <Select
                  value={classFilter}
                  onValueChange={(value) => {
                    setClassFilter(value);
                    setSectionFilter(ALL);
                  }}
                >
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

                <Select
                  value={sectionFilter}
                  onValueChange={setSectionFilter}
                  disabled={classFilter === ALL}
                >
                  <SelectTrigger className="w-[9rem]" aria-label="Filter by section">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All sections</SelectItem>
                    {sectionChoices.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[9.5rem]" aria-label="Filter by status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {STUDENT_STATUS_LABELS[status]}
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
            icon={GraduationCap}
            title={isFiltered ? 'No matching students' : 'No students yet'}
            description={
              isFiltered
                ? 'Try clearing the filters or searching for something else.'
                : 'Admit your first student to get started.'
            }
            action={
              !isFiltered &&
              can('STUDENTS', 'CREATE') && (
                <Button asChild>
                  <Link href="/students/new">
                    <Plus className="size-4" aria-hidden />
                    Admit student
                  </Link>
                </Button>
              )
            }
          />
        }
      />

      <PromoteStudentsDialog
        open={isPromoteOpen}
        onOpenChange={setIsPromoteOpen}
        studentIds={selectedIds}
        onPromoted={() => {
          setRowSelection({});
          void query.refetch();
        }}
      />
    </div>
  );
}
