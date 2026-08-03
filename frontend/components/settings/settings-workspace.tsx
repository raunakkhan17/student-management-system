'use client';

import {
  ArrowRight,
  BellRing,
  BookMarked,
  GraduationCap,
  ReceiptIndianRupee,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { AttendanceRulesTab } from '@/components/settings/attendance-rules-tab';
import { EmailTemplatesTab } from '@/components/settings/email-templates-tab';
import { InstitutionTab } from '@/components/settings/institution-tab';
import { PermissionsTab } from '@/components/settings/permissions-tab';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import type { AppModule } from '@/types/enums';

/**
 * PRD Module 19 lists eight settings. Four are owned by the module that uses
 * them and are edited there — duplicating those screens here would give the
 * same data two front doors. This tab links to them instead.
 */
const ELSEWHERE: {
  label: string;
  description: string;
  href: string;
  icon: typeof BookMarked;
  module: AppModule;
}[] = [
  {
    label: 'Academic session',
    description: 'Academic years, semesters and the current session.',
    href: '/academics',
    icon: BookMarked,
    module: 'ACADEMICS',
  },
  {
    label: 'Grade system',
    description: 'Grade scales and the bands each grade covers.',
    href: '/exams',
    icon: GraduationCap,
    module: 'EXAMS',
  },
  {
    label: 'Fee configuration',
    description: 'Fee categories, structures, discounts and late-fee rules.',
    href: '/fees',
    icon: ReceiptIndianRupee,
    module: 'FEES',
  },
  {
    label: 'Notification settings',
    description: 'Which events you are notified about, and how.',
    href: '/profile',
    icon: BellRing,
    module: 'COMMUNICATION',
  },
];

export function SettingsWorkspace() {
  const { can } = useAuth();

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Institution profile, attendance rules, templates and access control."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Settings' }]}
      />

      <Tabs defaultValue="institution" className="space-y-4">
        <ScrollArea className="w-full">
          <TabsList className="w-max">
            <TabsTrigger value="institution">Institution</TabsTrigger>
            <TabsTrigger value="attendance">Attendance rules</TabsTrigger>
            <TabsTrigger value="templates">Email templates</TabsTrigger>
            <TabsTrigger value="permissions">Roles &amp; permissions</TabsTrigger>
            <TabsTrigger value="elsewhere">More settings</TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="institution" className="mt-0">
          <InstitutionTab />
        </TabsContent>
        <TabsContent value="attendance" className="mt-0">
          <AttendanceRulesTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-0">
          <EmailTemplatesTab />
        </TabsContent>
        <TabsContent value="permissions" className="mt-0">
          <PermissionsTab />
        </TabsContent>

        <TabsContent value="elsewhere" className="mt-0">
          <div className="grid gap-4 sm:grid-cols-2">
            {ELSEWHERE.filter((item) => can(item.module, 'VIEW')).map((item) => (
              <Card
                key={item.href}
                className="hover:border-primary/40 focus-within:ring-ring group relative transition-colors focus-within:ring-2"
              >
                <CardContent className="flex items-start gap-3 pt-6">
                  <span className="bg-primary-muted text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                    <item.icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={item.href}
                      className="text-sm font-medium after:absolute after:inset-0 focus:outline-none"
                    >
                      {item.label}
                    </Link>
                    <p className="text-muted-foreground mt-0.5 text-xs">{item.description}</p>
                  </div>
                  <ArrowRight
                    className="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-colors"
                    aria-hidden
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
