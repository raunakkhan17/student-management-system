import type { AuditAction, AppModule, Gender, UserRole } from './enums';

/**
 * Mirrors `backend/src/services/dashboard.service.ts`. The summary is a
 * discriminated union on `role` so each dashboard reads only the fields it was
 * actually served.
 */

export interface UpcomingExam {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  class: { name: string } | null;
}

export interface DashboardNotice {
  id: string;
  title: string;
  category: string;
  priority: string;
  isPinned: boolean;
  publishAt: string | null;
}

export interface ScheduledClass {
  id: string;
  type: string;
  period: string;
  startTime: string;
  endTime: string;
  subject: string | null;
  room: string | null;
  className: string;
  sectionName: string;
  teacher: string | null;
}

export interface AttendanceSnapshot {
  present: number;
  absent: number;
  total: number;
  percentage: number | null;
}

export interface FeeSnapshot {
  /** Decimal serialised as a string — never parse it into a float for display. */
  outstanding: string;
  unpaidInvoices: number;
  nextDue: {
    id: string;
    invoiceNumber: string;
    dueDate: string;
    balanceAmount: string;
  } | null;
}

export interface AssignmentSnapshot {
  due: number;
  submitted: number;
  evaluated: number;
  upcoming: {
    id: string;
    title: string;
    dueDate: string;
    maxMarks: string;
    subject: { name: string };
  }[];
}

export interface ActivityEntry {
  id: string;
  action: AuditAction;
  module: AppModule;
  description: string | null;
  at: string;
  actor: string;
}

export interface AdminSummary {
  role: 'ADMIN';
  totals: { students: number; teachers: number; newAdmissions: number; upcomingExams: number };
  attendanceToday: AttendanceSnapshot;
  fees: {
    collected: string;
    pending: string;
    collectionRate: number | null;
    outstandingInvoices: number;
  };
  upcomingExams: UpcomingExam[];
  recentActivity: ActivityEntry[];
  /** False for accountants and librarians — the audit trail is not theirs to read. */
  canViewActivity: boolean;
}

export interface TeacherSummary {
  role: 'TEACHER';
  todaysClasses: ScheduledClass[];
  pendingAttendance: number;
  assignments: { total: number; published: number; awaitingEvaluation: number; overdue: number };
  upcomingExams: UpcomingExam[];
  announcements: DashboardNotice[];
}

export interface StudentSummary {
  role: 'STUDENT';
  attendance: AttendanceSnapshot;
  fees: FeeSnapshot;
  assignments: AssignmentSnapshot;
  upcomingExams: UpcomingExam[];
  notices: DashboardNotice[];
  todaysClasses: ScheduledClass[];
}

export interface ChildSummary {
  id: string;
  name: string;
  admissionNumber: string;
  className: string | null;
  sectionName: string | null;
  attendance: AttendanceSnapshot;
  fees: FeeSnapshot;
  marks: {
    id: string;
    subject: string;
    exam: string;
    marksObtained: string | null;
    maxMarks: string;
    isAbsent: boolean;
  }[];
  homework: { due: number; upcoming: AssignmentSnapshot['upcoming'] };
}

export interface ParentSummary {
  role: 'PARENT';
  children: ChildSummary[];
  announcements: DashboardNotice[];
}

export type DashboardSummary =
  | AdminSummary
  | TeacherSummary
  | StudentSummary
  | ParentSummary;

/** Which summary a role receives — the four admin-side roles share one view. */
export const ADMIN_DASHBOARD_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'ACCOUNTANT',
  'LIBRARIAN',
];

export interface DashboardCharts {
  range: { from: string; to: string; days: number };
  attendanceTrend: { date: string; percentage: number | null }[];
  feeCollection: { date: string; amount: string; count: number }[];
  studentGrowth: { month: string; admitted: number; total: number }[];
  genderDistribution: { gender: Gender; count: number }[];
  departmentStatistics: {
    id: string;
    name: string;
    code: string;
    teachers: number;
    subjects: number;
    students: number;
  }[];
}
