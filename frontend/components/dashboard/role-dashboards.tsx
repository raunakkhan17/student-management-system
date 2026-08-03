'use client';

import {
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Megaphone,
  NotebookPen,
  Percent,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { StatTile } from '@/components/dashboard/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import type {
  ChildSummary,
  DashboardNotice,
  ParentSummary,
  ScheduledClass,
  StudentSummary,
  TeacherSummary,
  UpcomingExam,
} from '@/types/dashboard';

// ------------------------------------------------------------------
// Shared panels
// ------------------------------------------------------------------

function Panel({
  title,
  href,
  children,
  isEmpty,
  emptyMessage,
}: {
  title: string;
  href?: string;
  children: ReactNode;
  isEmpty?: boolean;
  emptyMessage?: string;
}) {
  return (
    <section className="bg-card rounded-xl border p-5" aria-label={title}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {href && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={href}>View all</Link>
          </Button>
        )}
      </div>
      {isEmpty ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {emptyMessage ?? 'Nothing to show.'}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function TimetablePanel({ classes }: { classes: ScheduledClass[] }) {
  return (
    <Panel
      title="Today's classes"
      href="/timetable"
      isEmpty={classes.length === 0}
      emptyMessage="No classes scheduled today."
    >
      <ul className="divide-y">
        {classes.map((slot) => (
          <li key={slot.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="text-muted-foreground w-24 shrink-0 text-xs tabular-nums">
              {slot.startTime}–{slot.endTime}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{slot.subject ?? slot.period}</p>
              <p className="text-muted-foreground truncate text-xs">
                {slot.className} {slot.sectionName}
                {slot.room ? ` · ${slot.room}` : ''}
                {slot.teacher ? ` · ${slot.teacher}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ExamsPanel({ exams }: { exams: UpcomingExam[] }) {
  return (
    <Panel
      title="Upcoming exams"
      href="/exams"
      isEmpty={exams.length === 0}
      emptyMessage="No exams scheduled."
    >
      <ul className="divide-y">
        {exams.map((exam) => (
          <li key={exam.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{exam.name}</p>
              <p className="text-muted-foreground text-xs">{formatDate(exam.startDate)}</p>
            </div>
            <Badge variant="outline">{exam.type.replace(/_/g, ' ')}</Badge>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function NoticesPanel({ notices, title }: { notices: DashboardNotice[]; title: string }) {
  return (
    <Panel
      title={title}
      href="/notices"
      isEmpty={notices.length === 0}
      emptyMessage="No announcements right now."
    >
      <ul className="divide-y">
        {notices.map((notice) => (
          <li key={notice.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <Megaphone className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{notice.title}</p>
              <p className="text-muted-foreground text-xs">
                {notice.publishAt ? formatDate(notice.publishAt) : 'Unscheduled'}
              </p>
            </div>
            {notice.isPinned && <Badge variant="secondary">Pinned</Badge>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ------------------------------------------------------------------
// Teacher
// ------------------------------------------------------------------

export function TeacherDashboard({ summary }: { summary: TeacherSummary }) {
  const { assignments } = summary;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Today's classes"
          value={summary.todaysClasses.length}
          icon={Clock}
          hint="On your timetable"
          href="/timetable"
        />
        <StatTile
          label="Pending attendance"
          value={summary.pendingAttendance}
          icon={ClipboardCheck}
          tone={summary.pendingAttendance > 0 ? 'warning' : 'default'}
          hint={
            summary.pendingAttendance > 0 ? 'Registers not submitted' : 'All registers submitted'
          }
          href="/attendance"
        />
        <StatTile
          label="To evaluate"
          value={assignments.awaitingEvaluation}
          icon={NotebookPen}
          tone={assignments.awaitingEvaluation > 0 ? 'warning' : 'default'}
          hint={`${assignments.published} published assignments`}
          href="/assignments"
        />
        <StatTile
          label="Upcoming exams"
          value={summary.upcomingExams.length}
          icon={CalendarClock}
          hint="Scheduled or running"
          href="/exams"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TimetablePanel classes={summary.todaysClasses} />
        <ExamsPanel exams={summary.upcomingExams} />
      </div>

      <NoticesPanel notices={summary.announcements} title="Recent announcements" />
    </div>
  );
}

// ------------------------------------------------------------------
// Student
// ------------------------------------------------------------------

export function StudentDashboard({ summary }: { summary: StudentSummary }) {
  const { attendance, fees, assignments } = summary;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Attendance"
          value={attendance.percentage === null ? '—' : `${attendance.percentage}%`}
          icon={Percent}
          tone={
            attendance.percentage !== null && attendance.percentage < 75 ? 'danger' : 'default'
          }
          hint={`${attendance.present} of ${attendance.total} sessions`}
          href="/attendance"
        />
        <StatTile
          label="Assignments due"
          value={assignments.due}
          icon={NotebookPen}
          tone={assignments.due > 0 ? 'warning' : 'default'}
          hint={`${assignments.submitted} submitted`}
          href="/assignments"
        />
        <StatTile
          label="Fees outstanding"
          value={formatCurrency(fees.outstanding)}
          icon={Wallet}
          tone={Number(fees.outstanding) > 0 ? 'warning' : 'default'}
          hint={
            fees.nextDue ? `Next due ${formatDate(fees.nextDue.dueDate)}` : 'Nothing outstanding'
          }
          href="/fees"
        />
        <StatTile
          label="Upcoming exams"
          value={summary.upcomingExams.length}
          icon={CalendarClock}
          hint="For your class"
          href="/exams"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TimetablePanel classes={summary.todaysClasses} />

        <Panel
          title="Assignments due"
          href="/assignments"
          isEmpty={assignments.upcoming.length === 0}
          emptyMessage="Nothing due — you are all caught up."
        >
          <ul className="divide-y">
            {assignments.upcoming.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <BookOpen className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {item.subject.name} · due {formatDateTime(item.dueDate)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ExamsPanel exams={summary.upcomingExams} />
        <NoticesPanel notices={summary.notices} title="Notices" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Parent
// ------------------------------------------------------------------

export function ParentDashboard({ summary }: { summary: ParentSummary }) {
  if (summary.children.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No student records are linked to your account yet. Please contact the school office.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {summary.children.map((child) => (
        <ChildPanel key={child.id} child={child} />
      ))}
      <NoticesPanel notices={summary.announcements} title="Announcements" />
    </div>
  );
}

function ChildPanel({ child }: { child: ChildSummary }) {
  return (
    <section aria-label={child.name} className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold">{child.name}</h2>
        <p className="text-muted-foreground text-sm">
          {child.className ?? 'Unassigned'}
          {child.sectionName ? ` ${child.sectionName}` : ''} · {child.admissionNumber}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Attendance"
          value={child.attendance.percentage === null ? '—' : `${child.attendance.percentage}%`}
          icon={Percent}
          tone={
            child.attendance.percentage !== null && child.attendance.percentage < 75
              ? 'danger'
              : 'default'
          }
          hint={`${child.attendance.present} of ${child.attendance.total} sessions`}
          href="/attendance"
        />
        <StatTile
          label="Homework due"
          value={child.homework.due}
          icon={NotebookPen}
          tone={child.homework.due > 0 ? 'warning' : 'default'}
          hint="Not yet submitted"
          href="/assignments"
        />
        <StatTile
          label="Fees outstanding"
          value={formatCurrency(child.fees.outstanding)}
          icon={Wallet}
          tone={Number(child.fees.outstanding) > 0 ? 'warning' : 'default'}
          hint={
            child.fees.nextDue
              ? `Next due ${formatDate(child.fees.nextDue.dueDate)}`
              : 'Nothing outstanding'
          }
          href="/fees"
        />
        <StatTile
          label="Recent marks"
          value={child.marks.length}
          icon={ClipboardList}
          hint="Published results"
          href="/exams"
        />
      </div>

      <Panel
        title="Latest marks"
        href="/exams"
        isEmpty={child.marks.length === 0}
        emptyMessage="No results published yet."
      >
        <ul className="divide-y">
          {child.marks.map((mark) => (
            <li key={mark.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{mark.subject}</p>
                <p className="text-muted-foreground truncate text-xs">{mark.exam}</p>
              </div>
              <span className="text-sm font-medium tabular-nums">
                {mark.isAbsent ? (
                  <Badge variant="outline">Absent</Badge>
                ) : (
                  `${Number(mark.marksObtained ?? 0)} / ${Number(mark.maxMarks)}`
                )}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
}
