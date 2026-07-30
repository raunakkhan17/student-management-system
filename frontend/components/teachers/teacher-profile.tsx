'use client';

import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Building2, CalendarDays, Mail, Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { PersonDocumentsPanel } from '@/components/documents/person-documents-panel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency, formatDate } from '@/lib/format';
import { teacherService } from '@/services/teacher.service';
import { BLOOD_GROUP_LABELS, GENDER_LABELS } from '@/types/enums';
import { EMPLOYMENT_TYPE_LABELS } from '@/types/teacher';

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm font-medium break-words">
        {value === null || value === undefined || value === '' ? (
          <span className="text-muted-foreground font-normal">—</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export function TeacherProfile({ teacherId }: { teacherId: string }) {
  const { hasRole } = useAuth();

  const query = useQuery({
    queryKey: ['teachers', teacherId],
    queryFn: () => teacherService.get(teacherId),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (query.error || !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const teacher = query.data;
  const fullName = `${teacher.user.firstName} ${teacher.user.lastName}`;
  const initials = `${teacher.user.firstName.charAt(0)}${teacher.user.lastName.charAt(0)}`.toUpperCase();

  // Salary is commercially sensitive; only administrators see it.
  const canSeeSalary = hasRole('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT');
  const currentSalary = teacher.salaries[0];

  return (
    <div>
      <PageHeader
        title={fullName}
        description={`${teacher.employeeId} · ${teacher.designation}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Teachers', href: '/teachers' },
          { label: fullName },
        ]}
      />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-5 pt-6 sm:flex-row sm:items-center">
          <Avatar className="size-16 shrink-0">
            <AvatarFallback className="bg-primary-muted text-primary text-lg font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-tight">{fullName}</h2>
              <StatusBadge status={teacher.status} />
              <Badge variant="secondary">{EMPLOYMENT_TYPE_LABELS[teacher.employmentType]}</Badge>
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="size-3.5" aria-hidden />
                {teacher.employeeId}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-3.5" aria-hidden />
                {teacher.user.email}
              </span>
              {teacher.user.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" aria-hidden />
                  {teacher.user.phone}
                </span>
              )}
              {teacher.department && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="size-3.5" aria-hidden />
                  {teacher.department.name}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden />
                Joined {formatDate(teacher.joiningDate)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Employment</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <DetailRow label="Designation" value={teacher.designation} />
              <DetailRow label="Department" value={teacher.department?.name} />
              <DetailRow label="Qualification" value={teacher.qualification} />
              <DetailRow label="Specialization" value={teacher.specialization} />
              <DetailRow label="Experience" value={`${teacher.experienceYears} years`} />
              <DetailRow label="Employment type" value={EMPLOYMENT_TYPE_LABELS[teacher.employmentType]} />
              <DetailRow label="Joining date" value={formatDate(teacher.joiningDate)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Personal</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <DetailRow label="Gender" value={GENDER_LABELS[teacher.gender]} />
              <DetailRow label="Date of birth" value={formatDate(teacher.dateOfBirth)} />
              <DetailRow
                label="Blood group"
                value={teacher.bloodGroup ? BLOOD_GROUP_LABELS[teacher.bloodGroup] : null}
              />
              <DetailRow
                label="Address"
                value={
                  teacher.address
                    ? [
                        teacher.address.line1,
                        teacher.address.line2,
                        teacher.address.city,
                        teacher.address.state,
                        teacher.address.postalCode,
                      ]
                        .filter(Boolean)
                        .join(', ')
                    : null
                }
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subjects</CardTitle>
            <CardDescription>Subjects this teacher is qualified to teach.</CardDescription>
          </CardHeader>
          <CardContent className={teacher.subjects.length === 0 ? 'p-0' : undefined}>
            {teacher.subjects.length === 0 ? (
              <EmptyState size="compact" title="No subjects assigned" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {teacher.subjects.map((link) => (
                  <Badge key={link.subject.id} variant="secondary" className="px-3 py-1">
                    {link.subject.name}
                    <span className="text-muted-foreground ml-1.5">{link.subject.code}</span>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Teaching duties</CardTitle>
            <CardDescription>Classes owned and subject offerings taught.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-muted-foreground mb-2 text-sm">Class teacher of</p>
              {teacher.classTeacherOf.length === 0 && teacher.sectionTeacherOf.length === 0 ? (
                <p className="text-muted-foreground text-sm">Not a class teacher.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {teacher.classTeacherOf.map((record) => (
                    <Badge key={record.id} variant="outline">
                      {record.name}
                    </Badge>
                  ))}
                  {teacher.sectionTeacherOf.map((record) => (
                    <Badge key={record.id} variant="outline">
                      {record.class.name} — {record.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-muted-foreground mb-2 text-sm">Subject offerings</p>
              {teacher.classSubjects.length === 0 ? (
                <p className="text-muted-foreground text-sm">No offerings assigned.</p>
              ) : (
                <ul className="space-y-2">
                  {teacher.classSubjects.map((offering) => (
                    <li key={offering.id} className="text-sm">
                      <span className="font-medium">{offering.subject.name}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {offering.class.name}
                        {offering.section ? ` — ${offering.section.name}` : ''}
                        {offering.semester ? ` · ${offering.semester.name}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {canSeeSalary && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Salary</CardTitle>
              <CardDescription>
                Effective-dated record. Payroll processing is out of scope for this release.
              </CardDescription>
            </CardHeader>
            <CardContent className={teacher.salaries.length === 0 ? 'p-0' : undefined}>
              {teacher.salaries.length === 0 ? (
                <EmptyState size="compact" title="No salary recorded" />
              ) : (
                <>
                  {currentSalary && (
                    <dl className="mb-4 grid gap-4 sm:grid-cols-4">
                      <div>
                        <dt className="text-muted-foreground text-sm">Basic</dt>
                        <dd className="text-lg font-semibold tabular-nums">
                          {formatCurrency(currentSalary.basicSalary)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-sm">Allowances</dt>
                        <dd className="text-lg font-semibold tabular-nums">
                          {formatCurrency(currentSalary.allowances)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-sm">Deductions</dt>
                        <dd className="text-lg font-semibold tabular-nums">
                          {formatCurrency(currentSalary.deductions)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-sm">Effective from</dt>
                        <dd className="text-lg font-semibold">
                          {formatDate(currentSalary.effectiveFrom)}
                        </dd>
                      </div>
                    </dl>
                  )}

                  {teacher.salaries.length > 1 && (
                    <ul className="divide-y border-t">
                      {teacher.salaries.slice(1).map((record) => (
                        <li
                          key={record.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                        >
                          <span className="text-muted-foreground">
                            {formatDate(record.effectiveFrom)} –{' '}
                            {record.effectiveTo ? formatDate(record.effectiveTo) : 'present'}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatCurrency(record.basicSalary)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="mt-6">
        <PersonDocumentsPanel teacherId={teacherId} />
      </div>
    </div>
  );
}
