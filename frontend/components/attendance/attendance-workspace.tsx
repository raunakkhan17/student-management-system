'use client';

import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { AttendanceSheetScreen } from './attendance-sheet';
import { AttendanceRegisterTab } from './attendance-register-tab';
import { AttendanceSessionsTab } from './attendance-sessions-tab';
import { HolidaysTab } from './holidays-tab';

export function AttendanceWorkspace() {
  const { can } = useAuth();

  const canMark = can('ATTENDANCE', 'CREATE');
  const canManageHolidays = can('ATTENDANCE', 'CREATE');

  return (
    <Tabs defaultValue={canMark ? 'mark' : 'register'} className="space-y-4">
      <ScrollArea className="w-full">
        <TabsList className="w-max">
          {canMark && <TabsTrigger value="mark">Mark</TabsTrigger>}
          <TabsTrigger value="register">Monthly register</TabsTrigger>
          <TabsTrigger value="sessions">Submitted rolls</TabsTrigger>
          {canManageHolidays && <TabsTrigger value="holidays">Holidays</TabsTrigger>}
        </TabsList>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {canMark && (
        <TabsContent value="mark" className="mt-0">
          <AttendanceSheetScreen />
        </TabsContent>
      )}

      <TabsContent value="register" className="mt-0">
        <AttendanceRegisterTab />
      </TabsContent>

      <TabsContent value="sessions" className="mt-0">
        <AttendanceSessionsTab />
      </TabsContent>

      {canManageHolidays && (
        <TabsContent value="holidays" className="mt-0">
          <HolidaysTab />
        </TabsContent>
      )}
    </Tabs>
  );
}
