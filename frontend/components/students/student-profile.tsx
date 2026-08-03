'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  CalendarDays,
  IdCard,
  Mail,
  MoreHorizontal,
  Phone,
  Repeat,
  UserCog,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PersonDocumentsPanel } from '@/components/documents/person-documents-panel';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { studentService } from '@/services/student.service';
import { STUDENT_STATUS_LABELS, type StudentStatus } from '@/types/enums';
import { StudentAcademicTab } from './tabs/student-academic-tab';
import { StudentAttendanceTab } from './tabs/student-attendance-tab';
import { StudentFeesTab } from './tabs/student-fees-tab';
import { StudentGuardianTab } from './tabs/student-guardian-tab';
import { StudentLibraryTab } from './tabs/student-library-tab';
import { StudentPersonalTab } from './tabs/student-personal-tab';
import { StudentTimelineTab } from './tabs/student-timeline-tab';
import { TransferStudentDialog } from './transfer-student-dialog';

const STATUS_ACTIONS: StudentStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'GRADUATED', 'ARCHIVED'];

export function StudentProfile({ studentId }: { studentId: string }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<StudentStatus | null>(null);

  const query = useQuery({
    queryKey: ['students', studentId],
    queryFn: () => studentService.get(studentId),
  });

  const statusMutation = useMutation({
    mutationFn: (status: StudentStatus) => studentService.changeStatus(studentId, status),
    onSuccess: async (_data, status) => {
      toast.success(`Status changed to ${STUDENT_STATUS_LABELS[status]}`);
      await queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not change the status');
    },
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

  const student = query.data;
  const fullName = `${student.user.firstName} ${student.user.lastName}`;
  const initials = `${student.user.firstName.charAt(0)}${student.user.lastName.charAt(0)}`.toUpperCase();

  return (
    <div>
      <PageHeader
        title={fullName}
        description={`${student.admissionNumber}${student.class ? ` · ${student.class.name}` : ''}${
          student.section ? ` — ${student.section.name}` : ''
        }`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Students', href: '/students' },
          { label: fullName },
        ]}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/students/${studentId}/id-card`}>
                <IdCard className="size-4" aria-hidden />
                ID card
              </Link>
            </Button>

            {can('STUDENTS', 'EDIT') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <MoreHorizontal className="size-4" aria-hidden />
                    Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => setIsTransferOpen(true)}>
                    <Repeat className="size-4" aria-hidden />
                    Transfer class or section
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                    Change status
                  </DropdownMenuLabel>

                  {STATUS_ACTIONS.filter((status) => status !== student.status).map((status) => (
                    <DropdownMenuItem key={status} onClick={() => setStatusTarget(status)}>
                      <UserCog className="size-4" aria-hidden />
                      Mark {STUDENT_STATUS_LABELS[status].toLowerCase()}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      {/* Summary strip */}
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
              <StatusBadge status={student.status} />
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="size-3.5" aria-hidden />
                {student.admissionNumber}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-3.5" aria-hidden />
                {student.user.email}
              </span>
              {student.user.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" aria-hidden />
                  {student.user.phone}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden />
                {student.academicYear.name}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="personal" className="space-y-4">
        <ScrollArea className="w-full">
          <TabsList className="w-max">
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="guardian">Guardians</TabsTrigger>
            <TabsTrigger value="academic">Academic</TabsTrigger>
            {can('ATTENDANCE', 'VIEW') && (
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
            )}
            {can('FEES', 'VIEW') && <TabsTrigger value="fees">Fees</TabsTrigger>}
            {can('LIBRARY', 'VIEW') && <TabsTrigger value="library">Library</TabsTrigger>}
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="personal" className="mt-0">
          <StudentPersonalTab student={student} />
        </TabsContent>
        <TabsContent value="guardian" className="mt-0">
          <StudentGuardianTab student={student} />
        </TabsContent>
        <TabsContent value="academic" className="mt-0">
          <StudentAcademicTab student={student} />
        </TabsContent>
        {can('ATTENDANCE', 'VIEW') && (
          <TabsContent value="attendance" className="mt-0">
            <StudentAttendanceTab studentId={studentId} />
          </TabsContent>
        )}
        {can('FEES', 'VIEW') && (
          <TabsContent value="fees" className="mt-0">
            <StudentFeesTab studentId={studentId} />
          </TabsContent>
        )}
        {can('LIBRARY', 'VIEW') && (
          <TabsContent value="library" className="mt-0">
            <StudentLibraryTab userId={student.user.id} />
          </TabsContent>
        )}
        <TabsContent value="documents" className="mt-0">
          <PersonDocumentsPanel studentId={studentId} />
        </TabsContent>
        <TabsContent value="timeline" className="mt-0">
          <StudentTimelineTab studentId={studentId} />
        </TabsContent>
      </Tabs>

      <TransferStudentDialog
        open={isTransferOpen}
        onOpenChange={setIsTransferOpen}
        studentId={studentId}
        currentClassId={student.classId}
      />

      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
        title={`Mark this student ${statusTarget ? STUDENT_STATUS_LABELS[statusTarget].toLowerCase() : ''}?`}
        description={
          statusTarget === 'ACTIVE'
            ? 'The student regains access to their portal account.'
            : 'The student’s portal access is revoked and every active session is signed out.'
        }
        confirmLabel="Change status"
        variant={statusTarget === 'ACTIVE' ? 'default' : 'destructive'}
        onConfirm={async () => {
          if (statusTarget) {
            await statusMutation.mutateAsync(statusTarget);
            setStatusTarget(null);
          }
        }}
      />
    </div>
  );
}
