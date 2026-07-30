'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, MoreHorizontal, Plus, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { teacherService } from '@/services/teacher.service';
import {
  EMPLOYEE_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  type EmployeeStatus,
  type EmploymentType,
  type TeacherListItem,
} from '@/types/teacher';

const ALL = '__all__';
const STATUSES: EmployeeStatus[] = [
  'ACTIVE',
  'ON_LEAVE',
  'SUSPENDED',
  'RESIGNED',
  'RETIRED',
  'TERMINATED',
];
const EMPLOYMENT_TYPES: EmploymentType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'VISITING'];

export function TeachersList() {
  const router = useRouter();
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'employeeId', defaultSortOrder: 'asc' });

  const [departmentFilter, setDepartmentFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);

  const departments = useQuery({
    queryKey: ['academics', 'departments', 'all'],
    queryFn: () => academicService.listDepartments({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
  });

  const params = {
    ...table.queryParams,
    ...(departmentFilter !== ALL ? { departmentId: departmentFilter } : {}),
    ...(statusFilter !== ALL ? { status: statusFilter } : {}),
    ...(typeFilter !== ALL ? { employmentType: typeFilter as EmploymentType } : {}),
  };

  const query = useQuery({
    queryKey: ['teachers', params],
    queryFn: () => teacherService.list(params),
  });

  const exportMutation = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') => teacherService.exportTeachers({ ...params, format }),
    onSuccess: (blob, format) => {
      downloadBlob(blob, `teachers-${new Date().toISOString().slice(0, 10)}.${format}`);
      toast.success('Export downloaded');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not export teachers');
    },
  });

  const isFiltered =
    table.state.search.length > 0 ||
    departmentFilter !== ALL ||
    statusFilter !== ALL ||
    typeFilter !== ALL;

  const columns: ColumnDef<TeacherListItem, unknown>[] = [
    {
      id: 'teacher',
      header: 'Teacher',
      meta: { sortKey: 'user.firstName' },
      cell: ({ row }) => {
        const { user, employeeId } = row.original;
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
              <p className="text-muted-foreground truncate text-sm">{employeeId}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'designation',
      header: 'Designation',
      meta: { sortKey: 'designation' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate">{row.original.designation}</p>
          <p className="text-muted-foreground truncate text-sm">
            {row.original.department?.name ?? 'No department'}
          </p>
        </div>
      ),
    },
    {
      id: 'subjects',
      header: 'Subjects',
      meta: { hideOnMobile: true },
      cell: ({ row }) => {
        const subjects = row.original.subjects;
        if (subjects.length === 0) {
          return <span className="text-muted-foreground text-sm">None assigned</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {subjects.slice(0, 2).map((link) => (
              <Badge key={link.subject.id} variant="secondary">
                {link.subject.code}
              </Badge>
            ))}
            {subjects.length > 2 && <Badge variant="outline">+{subjects.length - 2}</Badge>}
          </div>
        );
      },
    },
    {
      accessorKey: 'experienceYears',
      header: 'Experience',
      meta: { sortKey: 'experienceYears', hideOnMobile: true, cellClassName: 'tabular-nums' },
      cell: ({ row }) => `${row.original.experienceYears} yr`,
    },
    {
      accessorKey: 'joiningDate',
      header: 'Joined',
      meta: { sortKey: 'joiningDate', hideOnMobile: true },
      cell: ({ row }) => formatDate(row.original.joiningDate),
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
              <Link href={`/teachers/${row.original.id}`}>View profile</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Teachers"
        description="Staff records, departments, subjects taught and employment status."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Teachers' }]}
        actions={
          <>
            {can('TEACHERS', 'EXPORT') && (
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

            {can('TEACHERS', 'CREATE') && (
              <Button asChild>
                <Link href="/teachers/new">
                  <Plus className="size-4" aria-hidden />
                  Add teacher
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
        onRowClick={(row) => router.push(`/teachers/${row.id}`)}
        toolbar={
          <DataTableToolbar
            search={table.state.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Name, employee ID, email or phone…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setDepartmentFilter(ALL);
              setStatusFilter(ALL);
              setTypeFilter(ALL);
            }}
            filters={
              <>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger className="w-[11rem]" aria-label="Filter by department">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All departments</SelectItem>
                    {(departments.data?.items ?? []).map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.name}
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
                        {EMPLOYEE_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[9.5rem]" aria-label="Filter by employment type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All types</SelectItem>
                    {EMPLOYMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {EMPLOYMENT_TYPE_LABELS[type]}
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
            icon={UsersRound}
            title={isFiltered ? 'No matching teachers' : 'No teachers yet'}
            description={
              isFiltered
                ? 'Try clearing the filters or searching for something else.'
                : 'Add your teaching staff so classes and subjects can be assigned.'
            }
            action={
              !isFiltered &&
              can('TEACHERS', 'CREATE') && (
                <Button asChild>
                  <Link href="/teachers/new">
                    <Plus className="size-4" aria-hidden />
                    Add teacher
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
