'use client';

import { BookOpen, CalendarCheck, FileText, ReceiptIndianRupee } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { StatCard } from '@/components/common/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import type { StudentDetail } from '@/types/student';

export function StudentAcademicTab({ student }: { student: StudentDetail }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Attendance records"
          value={student._count.attendanceRecords}
          icon={CalendarCheck}
          tone="info"
        />
        <StatCard
          label="Assignment submissions"
          value={student._count.submissions}
          icon={BookOpen}
          tone="primary"
        />
        <StatCard
          label="Invoices"
          value={student._count.invoices}
          icon={ReceiptIndianRupee}
          tone="warning"
        />
        <StatCard label="Documents" value={student._count.documents} icon={FileText} tone="success" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Placement</CardTitle>
          <CardDescription>Where this student currently sits in the structure.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="text-muted-foreground text-sm">Academic year</dt>
              <dd className="text-sm font-medium">{student.academicYear.name}</dd>
            </div>
            <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="text-muted-foreground text-sm">Class</dt>
              <dd className="text-sm font-medium">
                {student.class?.name ?? <span className="text-muted-foreground font-normal">Unplaced</span>}
              </dd>
            </div>
            <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="text-muted-foreground text-sm">Section</dt>
              <dd className="text-sm font-medium">
                {student.section?.name ?? (
                  <span className="text-muted-foreground font-normal">Unassigned</span>
                )}
              </dd>
            </div>
            <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="text-muted-foreground text-sm">Roll number</dt>
              <dd className="text-sm font-medium">
                {student.rollNumber ?? <span className="text-muted-foreground font-normal">—</span>}
              </dd>
            </div>
            <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="text-muted-foreground text-sm">Admitted on</dt>
              <dd className="text-sm font-medium">{formatDate(student.admissionDate)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Electives</CardTitle>
          <CardDescription>Optional subjects this student has chosen.</CardDescription>
        </CardHeader>
        <CardContent className={student.electives.length === 0 ? 'p-0' : undefined}>
          {student.electives.length === 0 ? (
            <EmptyState
              size="compact"
              icon={BookOpen}
              title="No electives chosen"
              description="Elective subjects offered to this student's class can be selected in Academic setup."
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {student.electives.map((elective) => (
                <Badge key={elective.id} variant="secondary" className="px-3 py-1">
                  {elective.classSubject.subject.name}
                  <span className="text-muted-foreground ml-1.5">
                    {elective.classSubject.subject.code}
                  </span>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
