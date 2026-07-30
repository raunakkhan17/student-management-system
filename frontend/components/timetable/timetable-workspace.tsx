'use client';

import { PageHeader } from '@/components/common/page-header';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { MyTimetable } from './my-timetable';
import { PeriodsTab } from './periods-tab';
import { RoomsTab } from './rooms-tab';
import { TimetablesList } from './timetables-list';

export function TimetableWorkspace() {
  const { hasRole, can } = useAuth();

  // Teachers and students care about their own week; admins manage the grids.
  const hasPersonalView = hasRole('TEACHER', 'STUDENT');
  const canManage = can('TIMETABLE', 'CREATE');

  return (
    <div>
      <PageHeader
        title="Timetable"
        description="Weekly schedules per section, with room and lab allocation and conflict checking."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Timetable' }]}
      />

      <Tabs defaultValue={hasPersonalView ? 'mine' : 'timetables'} className="space-y-4">
        <ScrollArea className="w-full">
          <TabsList className="w-max">
            {hasPersonalView && <TabsTrigger value="mine">My week</TabsTrigger>}
            <TabsTrigger value="timetables">Timetables</TabsTrigger>
            {canManage && <TabsTrigger value="rooms">Rooms &amp; labs</TabsTrigger>}
            {canManage && <TabsTrigger value="periods">Periods</TabsTrigger>}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {hasPersonalView && (
          <TabsContent value="mine" className="mt-0">
            <MyTimetable />
          </TabsContent>
        )}

        <TabsContent value="timetables" className="mt-0">
          <TimetablesList />
        </TabsContent>

        {canManage && (
          <TabsContent value="rooms" className="mt-0">
            <RoomsTab />
          </TabsContent>
        )}

        {canManage && (
          <TabsContent value="periods" className="mt-0">
            <PeriodsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
