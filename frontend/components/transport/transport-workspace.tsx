'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bus, Route as RouteIcon, Users } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency, formatPercent } from '@/lib/format';
import { transportService } from '@/services/transport.service';
import { DriversTab } from './drivers-tab';
import { MaintenanceTab } from './maintenance-tab';
import { RidersTab } from './riders-tab';
import { RoutesTab } from './routes-tab';
import { VehiclesTab } from './vehicles-tab';

export function TransportWorkspace() {
  const { can, hasRole } = useAuth();

  const isSelfService = hasRole('STUDENT', 'PARENT');
  const canManageFleet = can('TRANSPORT', 'CREATE') && !isSelfService;

  const stats = useQuery({
    queryKey: ['transport', 'stats'],
    queryFn: () => transportService.getStats(),
    enabled: !isSelfService,
  });

  return (
    <div>
      <PageHeader
        title="Transport"
        description={
          isSelfService
            ? 'Your route, boarding stop and pickup times.'
            : 'Fleet, drivers, routes, riders and maintenance.'
        }
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Transport' }]}
      />

      {!isSelfService && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active vehicles"
            value={stats.data?.activeVehicles ?? 0}
            icon={Bus}
            tone="primary"
            isLoading={stats.isLoading}
            hint={`${stats.data?.vehicleCount ?? 0} in fleet · ${stats.data?.inMaintenance ?? 0} in service`}
          />
          <StatCard
            label="Routes running"
            value={stats.data?.activeRoutes ?? 0}
            icon={RouteIcon}
            tone="info"
            isLoading={stats.isLoading}
            hint={`${stats.data?.activeDrivers ?? 0} driver(s) available`}
          />
          <StatCard
            label="Students riding"
            value={stats.data?.studentsAllocated ?? 0}
            icon={Users}
            tone="success"
            isLoading={stats.isLoading}
            hint={
              stats.data?.utilisationPercent === null || stats.data?.utilisationPercent === undefined
                ? `${stats.data?.seatsRemaining ?? 0} seat(s) free`
                : `${formatPercent(stats.data.utilisationPercent)} of seats used`
            }
          />
          <StatCard
            label="Compliance alerts"
            value={(stats.data?.documentsExpiringSoon ?? 0) + (stats.data?.expiredLicences ?? 0)}
            icon={AlertTriangle}
            tone="warning"
            isLoading={stats.isLoading}
            hint={`Maintenance this year ${formatCurrency(stats.data?.maintenanceSpendThisYear ?? 0)}`}
          />
        </div>
      )}

      <Tabs defaultValue="routes" className="space-y-4">
        <ScrollArea className="w-full">
          <TabsList className="w-max">
            <TabsTrigger value="routes">Routes</TabsTrigger>
            {!isSelfService && <TabsTrigger value="riders">Riders</TabsTrigger>}
            {canManageFleet && <TabsTrigger value="vehicles">Vehicles</TabsTrigger>}
            {canManageFleet && <TabsTrigger value="drivers">Drivers</TabsTrigger>}
            {canManageFleet && <TabsTrigger value="maintenance">Maintenance</TabsTrigger>}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="routes" className="mt-0">
          <RoutesTab />
        </TabsContent>

        {!isSelfService && (
          <TabsContent value="riders" className="mt-0">
            <RidersTab />
          </TabsContent>
        )}

        {canManageFleet && (
          <>
            <TabsContent value="vehicles" className="mt-0">
              <VehiclesTab />
            </TabsContent>

            <TabsContent value="drivers" className="mt-0">
              <DriversTab />
            </TabsContent>

            <TabsContent value="maintenance" className="mt-0">
              <MaintenanceTab />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
