'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { StudentAttendanceTab } from '@/components/students/tabs/student-attendance-tab';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { dashboardService } from '@/services/dashboard.service';

/**
 * The attendance screen for the two self-service roles.
 *
 * The staff workspace is built around a cohort — pick a class, pick a section,
 * read the grid — which is the wrong shape for someone entitled to exactly one
 * record. This shows that record directly, and the API refuses the cohort
 * endpoints for these roles regardless of what the interface offers.
 */
export function MyAttendancePanel() {
  const { user, hasRole } = useAuth();

  if (hasRole('STUDENT')) {
    const studentId = user?.studentProfile?.id;

    if (!studentId) {
      return (
        <EmptyState
          icon={CalendarCheck}
          title="No student record linked"
          description="This account is not linked to a student record. Please contact the school office."
        />
      );
    }

    return <StudentAttendanceTab studentId={studentId} />;
  }

  return <ChildAttendance />;
}

/** A parent may have more than one child, so each gets a tab. */
function ChildAttendance() {
  const query = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => dashboardService.getSummary(),
  });

  if (query.isPending) return <Skeleton className="h-96 w-full" />;

  const children = query.data?.role === 'PARENT' ? query.data.children : [];

  if (children.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No students linked"
        description="No student records are linked to your account. Please contact the school office."
      />
    );
  }

  if (children.length === 1 && children[0]) {
    return <StudentAttendanceTab studentId={children[0].id} />;
  }

  return (
    <Tabs defaultValue={children[0]?.id} className="space-y-4">
      <TabsList className="w-max">
        {children.map((child) => (
          <TabsTrigger key={child.id} value={child.id}>
            {child.name}
          </TabsTrigger>
        ))}
      </TabsList>

      {children.map((child) => (
        <TabsContent key={child.id} value={child.id} className="mt-0">
          <StudentAttendanceTab studentId={child.id} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
