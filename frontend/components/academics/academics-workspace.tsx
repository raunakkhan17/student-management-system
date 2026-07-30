'use client';

import { PageHeader } from '@/components/common/page-header';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AcademicYearsTab } from './academic-years-tab';
import { ClassesTab } from './classes-tab';
import { CoursesTab } from './courses-tab';
import { DepartmentsTab } from './departments-tab';
import { OfferingsTab } from './offerings-tab';
import { SectionsTab } from './sections-tab';
import { SemestersTab } from './semesters-tab';
import { SubjectsTab } from './subjects-tab';

/** Ordered so an administrator can set the institution up top to bottom. */
const TABS = [
  { value: 'years', label: 'Academic years', Panel: AcademicYearsTab },
  { value: 'departments', label: 'Departments', Panel: DepartmentsTab },
  { value: 'courses', label: 'Courses', Panel: CoursesTab },
  { value: 'classes', label: 'Classes', Panel: ClassesTab },
  { value: 'sections', label: 'Sections', Panel: SectionsTab },
  { value: 'subjects', label: 'Subjects', Panel: SubjectsTab },
  { value: 'semesters', label: 'Semesters', Panel: SemestersTab },
  { value: 'offerings', label: 'Subject offerings', Panel: OfferingsTab },
] as const;

export function AcademicsWorkspace() {
  return (
    <div>
      <PageHeader
        title="Academic setup"
        description="Define the structure everything else hangs off: years, departments, courses, classes, sections, subjects and semesters."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Academic setup' }]}
      />

      <Tabs defaultValue="years" className="space-y-4">
        {/* The tab strip scrolls horizontally on narrow screens rather than wrapping. */}
        <ScrollArea className="w-full">
          <TabsList className="w-max">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {TABS.map(({ value, Panel }) => (
          <TabsContent key={value} value={value} className="mt-0">
            <Panel />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
