'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, CalendarClock, CircleCheck, CircleX } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { leaveService } from '@/services/leave.service';
import { LeaveBalancesTab } from './leave-balances-tab';
import { LeaveCalendarTab } from './leave-calendar-tab';
import { LeaveRequestsTab } from './leave-requests-tab';

export function LeaveWorkspace() {
  const stats = useQuery({
    queryKey: ['leave', 'stats'],
    queryFn: () => leaveService.getStats(),
  });

  return (
    <div>
      <PageHeader
        title="Leave"
        description="Requests, approvals, balances and who is away."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Leave' }]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Awaiting approval"
          value={stats.data?.pending ?? 0}
          icon={CalendarClock}
          tone="warning"
          isLoading={stats.isLoading}
        />
        <StatCard
          label="Away today"
          value={stats.data?.onLeaveToday ?? 0}
          icon={CalendarCheck}
          tone="info"
          isLoading={stats.isLoading}
        />
        <StatCard
          label="Approved"
          value={stats.data?.approved ?? 0}
          icon={CircleCheck}
          tone="success"
          isLoading={stats.isLoading}
        />
        <StatCard
          label="Rejected"
          value={stats.data?.rejected ?? 0}
          icon={CircleX}
          tone="danger"
          isLoading={stats.isLoading}
        />
      </div>

      <Tabs defaultValue="requests" className="space-y-4">
        <ScrollArea className="w-full">
          <TabsList className="w-max">
            <TabsTrigger value="requests">Requests</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="balances">Balances</TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="requests" className="mt-0">
          <LeaveRequestsTab />
        </TabsContent>

        <TabsContent value="calendar" className="mt-0">
          <LeaveCalendarTab />
        </TabsContent>

        <TabsContent value="balances" className="mt-0">
          <LeaveBalancesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
