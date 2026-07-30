'use client';

import { KeyRound, Mail, Phone, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABELS, USER_STATUS_LABELS } from '@/types/enums';

/** A single label/value row used throughout the profile panels. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm font-medium break-words">{value}</dd>
    </div>
  );
}

export function ProfileOverview() {
  const { user, fullName, initials } = useAuth();

  if (!user) return null;

  const student = user.studentProfile;
  const teacher = user.teacherProfile;
  const guardian = user.guardianProfile;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="My profile"
        description="Your account details as recorded by the institution."
        actions={
          <Button asChild variant="outline">
            <Link href="/change-password">
              <KeyRound className="size-4" aria-hidden />
              Change password
            </Link>
          </Button>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col items-start gap-5 pt-6 sm:flex-row sm:items-center">
            <Avatar className="size-16">
              <AvatarFallback className="bg-primary-muted text-primary text-lg font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="truncate text-xl font-semibold tracking-tight">{fullName}</h2>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" aria-hidden />
                  {user.email}
                </span>
                {user.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-3.5" aria-hidden />
                    {user.phone}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                <ShieldCheck className="size-3.5" aria-hidden />
                {ROLE_LABELS[user.role]}
              </Badge>
              <Badge variant={user.status === 'ACTIVE' ? 'default' : 'outline'}>
                {USER_STATUS_LABELS[user.status]}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Sign-in details and session history.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <DetailRow label="Email" value={user.email} />
              <DetailRow label="Phone" value={user.phone ?? '—'} />
              <DetailRow label="Role" value={ROLE_LABELS[user.role]} />
              <DetailRow label="Last signed in" value={formatDateTime(user.lastLoginAt)} />
              <DetailRow label="Member since" value={formatDateTime(user.createdAt)} />
            </dl>
          </CardContent>
        </Card>

        {student && (
          <Card>
            <CardHeader>
              <CardTitle>Student record</CardTitle>
              <CardDescription>Your enrolment details.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <DetailRow label="Admission number" value={student.admissionNumber} />
                <DetailRow label="Roll number" value={student.rollNumber ?? '—'} />
                <DetailRow label="Class" value={student.class?.name ?? '—'} />
                <DetailRow label="Section" value={student.section?.name ?? '—'} />
              </dl>
            </CardContent>
          </Card>
        )}

        {teacher && (
          <Card>
            <CardHeader>
              <CardTitle>Employment</CardTitle>
              <CardDescription>Your staff record.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <DetailRow label="Employee ID" value={teacher.employeeId} />
                <DetailRow label="Designation" value={teacher.designation} />
                <DetailRow label="Department" value={teacher.department?.name ?? '—'} />
              </dl>
            </CardContent>
          </Card>
        )}

        {guardian && guardian.students.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Linked students</CardTitle>
              <CardDescription>Records you are authorised to view.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {guardian.students.map(({ student: child, isPrimary }, index) => (
                <div key={child.id}>
                  {index > 0 && <Separator className="mb-4" />}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {child.user.firstName} {child.user.lastName}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {child.admissionNumber}
                        {child.class ? ` · ${child.class.name}` : ''}
                        {child.section ? ` · ${child.section.name}` : ''}
                      </p>
                    </div>
                    {isPrimary && <Badge variant="secondary">Primary guardian</Badge>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
