'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, BedDouble, MessageSquareWarning, Users } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { formatPercent } from '@/lib/format';
import { hostelService } from '@/services/hostel.service';
import { ComplaintsTab } from './complaints-tab';
import { HostelsTab } from './hostels-tab';
import { MessTab } from './mess-tab';
import { ResidentsTab } from './residents-tab';
import { RoomsTab } from './rooms-tab';
import { TransfersTab } from './transfers-tab';
import { VisitorsTab } from './visitors-tab';

export function HostelWorkspace() {
  const { can, hasRole } = useAuth();

  const isSelfService = hasRole('STUDENT', 'PARENT');
  const canManage = can('HOSTEL', 'CREATE') && !isSelfService;

  const stats = useQuery({
    queryKey: ['hostel', 'stats'],
    queryFn: () => hostelService.getStats(),
    enabled: !isSelfService,
  });

  return (
    <div>
      <PageHeader
        title="Hostel"
        description={
          isSelfService
            ? 'Your room, mess plan and any complaints you have raised.'
            : 'Blocks, rooms, residents, visitors, mess plans and complaints.'
        }
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Hostel' }]}
      />

      {!isSelfService && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Beds occupied"
            value={`${stats.data?.occupied ?? 0} / ${stats.data?.capacity ?? 0}`}
            icon={BedDouble}
            tone="primary"
            isLoading={stats.isLoading}
            hint={
              stats.data?.occupancyPercent === null || stats.data?.occupancyPercent === undefined
                ? `${stats.data?.roomCount ?? 0} room(s)`
                : `${formatPercent(stats.data.occupancyPercent)} full`
            }
          />
          <StatCard
            label="Residents"
            value={stats.data?.residents ?? 0}
            icon={Users}
            tone="success"
            isLoading={stats.isLoading}
            hint={`${stats.data?.vacant ?? 0} bed(s) free`}
          />
          <StatCard
            label="Open complaints"
            value={stats.data?.openComplaints ?? 0}
            icon={MessageSquareWarning}
            tone="warning"
            isLoading={stats.isLoading}
            hint={`${stats.data?.resolvedComplaints ?? 0} resolved`}
          />
          <StatCard
            label="Pending transfers"
            value={stats.data?.pendingTransfers ?? 0}
            icon={ArrowRightLeft}
            tone="info"
            isLoading={stats.isLoading}
            hint={`${stats.data?.visitorsInside ?? 0} visitor(s) on site`}
          />
        </div>
      )}

      <Tabs defaultValue={isSelfService ? 'complaints' : 'rooms'} className="space-y-4">
        <ScrollArea className="w-full">
          <TabsList className="w-max">
            {!isSelfService && <TabsTrigger value="rooms">Rooms</TabsTrigger>}
            {!isSelfService && <TabsTrigger value="residents">Residents</TabsTrigger>}
            {!isSelfService && <TabsTrigger value="transfers">Transfers</TabsTrigger>}
            {!isSelfService && <TabsTrigger value="visitors">Visitors</TabsTrigger>}
            <TabsTrigger value="mess">Mess</TabsTrigger>
            <TabsTrigger value="complaints">Complaints</TabsTrigger>
            {canManage && <TabsTrigger value="blocks">Blocks</TabsTrigger>}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {!isSelfService && (
          <>
            <TabsContent value="rooms" className="mt-0">
              <RoomsTab />
            </TabsContent>

            <TabsContent value="residents" className="mt-0">
              <ResidentsTab />
            </TabsContent>

            <TabsContent value="transfers" className="mt-0">
              <TransfersTab />
            </TabsContent>

            <TabsContent value="visitors" className="mt-0">
              <VisitorsTab />
            </TabsContent>
          </>
        )}

        <TabsContent value="mess" className="mt-0">
          <MessTab />
        </TabsContent>

        <TabsContent value="complaints" className="mt-0">
          <ComplaintsTab />
        </TabsContent>

        {canManage && (
          <TabsContent value="blocks" className="mt-0">
            <HostelsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
