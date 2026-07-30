'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { studentService } from '@/services/student.service';
import { BLOOD_GROUP_LABELS } from '@/types/enums';

/** Printable ID card (PRD Module 3 — Generate ID Card). */
export function StudentIdCard({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: ['students', studentId, 'id-card'],
    queryFn: () => studentService.getIdCard(studentId),
  });

  if (query.isLoading) {
    return <Skeleton className="h-96 w-full max-w-sm" />;
  }

  if (query.error || !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const { institution, student } = query.data;
  const initials = student.fullName
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();

  return (
    <div>
      {/* Chrome is hidden when printing so only the card reaches the page. */}
      <div className="print:hidden">
        <PageHeader
          title="Student ID card"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Students', href: '/students' },
            { label: student.fullName, href: `/students/${studentId}` },
            { label: 'ID card' },
          ]}
          actions={
            <>
              <Button asChild variant="outline">
                <Link href={`/students/${studentId}`}>
                  <ArrowLeft className="size-4" aria-hidden />
                  Back to profile
                </Link>
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden />
                Print
              </Button>
            </>
          }
        />
      </div>

      <div className="flex justify-center">
        {/* Fixed to standard CR80 proportions so it prints true to size. */}
        <div className="w-[21.5rem] overflow-hidden rounded-xl border shadow-sm print:shadow-none">
          <div className="bg-primary text-primary-foreground px-5 py-4 text-center">
            <p className="text-base font-semibold tracking-tight">
              {institution?.name ?? 'EduCore Institute'}
            </p>
            <p className="text-primary-foreground/80 text-xs">
              Student identity card · {student.academicYear}
            </p>
          </div>

          <div className="bg-card space-y-4 p-5">
            <div className="flex items-center gap-4">
              <div className="bg-primary-muted text-primary grid size-20 shrink-0 place-items-center rounded-lg text-xl font-semibold">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold tracking-tight">{student.fullName}</p>
                <p className="text-muted-foreground text-sm">{student.admissionNumber}</p>
                <p className="text-muted-foreground text-sm">
                  {student.className ?? 'Unplaced'}
                  {student.sectionName ? ` — ${student.sectionName}` : ''}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-4 text-sm">
              <dt className="text-muted-foreground">Roll number</dt>
              <dd className="font-medium">{student.rollNumber ?? '—'}</dd>

              <dt className="text-muted-foreground">Date of birth</dt>
              <dd className="font-medium">{formatDate(student.dateOfBirth)}</dd>

              <dt className="text-muted-foreground">Blood group</dt>
              <dd className="font-medium">
                {student.bloodGroup ? BLOOD_GROUP_LABELS[student.bloodGroup] : '—'}
              </dd>
            </dl>

            <div className="border-t pt-3 text-xs">
              <p className="text-muted-foreground">In an emergency, contact</p>
              <p className="font-medium">
                {student.emergencyContactName} · {student.emergencyContactPhone}
              </p>
            </div>
          </div>

          <div className="bg-muted text-muted-foreground px-5 py-2 text-center text-[0.7rem]">
            If found, please return to {institution?.name ?? 'the institution'}
            {institution?.phone ? ` · ${institution.phone}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
