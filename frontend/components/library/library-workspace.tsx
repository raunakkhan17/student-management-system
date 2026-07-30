'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookMarked, BookOpenCheck, IndianRupee, Library, Settings } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/format';
import { libraryService } from '@/services/library.service';
import { BooksTab } from './books-tab';
import { CirculationTab } from './circulation-tab';
import { IssueBookDialog } from './issue-book-dialog';
import { LibrarySettingsDialog } from './library-settings-dialog';
import { MyLoansPanel } from './my-loans-panel';
import { TaxonomyTab } from './taxonomy-tab';

export function LibraryWorkspace() {
  const { can, hasRole } = useAuth();
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const isSelfService = hasRole('STUDENT', 'PARENT');
  const canManageConfig = can('LIBRARY', 'CREATE') && !isSelfService;

  const stats = useQuery({
    queryKey: ['library', 'stats'],
    queryFn: () => libraryService.getStats(),
    enabled: !isSelfService,
  });

  return (
    <div>
      <PageHeader
        title="Library"
        description={
          isSelfService
            ? 'Search the catalogue and track the books you have out.'
            : 'Catalogue, holdings, circulation and fines.'
        }
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Library' }]}
        actions={
          <>
            {can('SETTINGS', 'EDIT') && (
              <Button variant="outline" onClick={() => setIsSettingsOpen(true)}>
                <Settings className="size-4" aria-hidden />
                Rules
              </Button>
            )}
            {can('LIBRARY', 'ASSIGN') && (
              <Button onClick={() => setIsIssueOpen(true)}>
                <BookOpenCheck className="size-4" aria-hidden />
                Issue a book
              </Button>
            )}
          </>
        }
      />

      {!isSelfService && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Titles catalogued"
            value={stats.data?.titles ?? 0}
            icon={BookMarked}
            tone="primary"
            isLoading={stats.isLoading}
            hint={`${stats.data?.totalCopies ?? 0} physical copy(ies)`}
          />
          <StatCard
            label="On the shelf"
            value={stats.data?.availableCopies ?? 0}
            icon={Library}
            tone="success"
            isLoading={stats.isLoading}
            hint={`${stats.data?.issuedCopies ?? 0} on loan`}
          />
          <StatCard
            label="Overdue loans"
            value={stats.data?.overdueLoans ?? 0}
            icon={AlertTriangle}
            tone="danger"
            isLoading={stats.isLoading}
            hint={`${stats.data?.activeLoans ?? 0} loan(s) active`}
          />
          <StatCard
            label="Unpaid fines"
            value={formatCurrency(stats.data?.unpaidFines ?? 0)}
            icon={IndianRupee}
            tone="warning"
            isLoading={stats.isLoading}
            hint={`${stats.data?.activeReservations ?? 0} reservation(s) waiting`}
          />
        </div>
      )}

      <Tabs defaultValue={isSelfService ? 'my-loans' : 'catalogue'} className="space-y-4">
        <ScrollArea className="w-full">
          <TabsList className="w-max">
            <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
            {!isSelfService && <TabsTrigger value="circulation">Circulation</TabsTrigger>}
            <TabsTrigger value="my-loans">My loans</TabsTrigger>
            {canManageConfig && <TabsTrigger value="setup">Setup</TabsTrigger>}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="catalogue" className="mt-0">
          <BooksTab />
        </TabsContent>

        {!isSelfService && (
          <TabsContent value="circulation" className="mt-0">
            <CirculationTab />
          </TabsContent>
        )}

        <TabsContent value="my-loans" className="mt-0">
          <MyLoansPanel />
        </TabsContent>

        {canManageConfig && (
          <TabsContent value="setup" className="mt-0">
            <TaxonomyTab />
          </TabsContent>
        )}
      </Tabs>

      <IssueBookDialog open={isIssueOpen} onOpenChange={setIsIssueOpen} />
      <LibrarySettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </div>
  );
}
