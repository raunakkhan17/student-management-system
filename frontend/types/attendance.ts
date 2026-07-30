import type { ListQueryParams } from './api';

export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LATE'
  | 'HALF_DAY'
  | 'LEAVE'
  | 'HOLIDAY';

export type AttendanceSessionStatus = 'DRAFT' | 'SUBMITTED' | 'LOCKED';

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  HALF_DAY: 'Half day',
  LEAVE: 'Leave',
  HOLIDAY: 'Holiday',
};

/** Statuses a teacher can pick on the marking sheet. HOLIDAY is derived, not chosen. */
export const MARKABLE_STATUSES: AttendanceStatus[] = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'HALF_DAY',
  'LEAVE',
];

export interface AttendanceSheetStudent {
  studentId: string;
  admissionNumber: string;
  rollNumber: string | null;
  photoId: string | null;
  firstName: string;
  lastName: string;
  status: AttendanceStatus | null;
  minutesLate: number | null;
  remarks: string | null;
}

export interface AttendanceSheet {
  session: {
    id: string;
    status: AttendanceSessionStatus;
    submittedAt: string | null;
    lockedAt: string | null;
    remarks: string | null;
    markedBy: { id: string; firstName: string; lastName: string };
  } | null;
  holiday: { name: string; date: string; endDate: string | null } | null;
  rules: {
    lateThresholdMinutes: number;
    halfDayThresholdMinutes: number;
    allowBackdatedDays: number;
  };
  students: AttendanceSheetStudent[];
}

export interface AttendanceSessionListItem {
  id: string;
  date: string;
  status: AttendanceSessionStatus;
  submittedAt: string | null;
  lockedAt: string | null;
  remarks: string | null;
  class: { id: string; name: string };
  section: { id: string; name: string };
  subject: { id: string; name: string; code: string } | null;
  markedBy: { firstName: string; lastName: string };
  _count: { records: number };
}

export interface MonthlyAttendanceRow {
  studentId: string;
  admissionNumber: string;
  rollNumber: string | null;
  firstName: string;
  lastName: string;
  counts: Record<AttendanceStatus, number>;
  totalMarked: number;
  percentage: number | null;
}

export interface MonthlyAttendance {
  period: { year: number; month: number; start: string; end: string };
  holidays: { name: string; date: string; endDate: string | null }[];
  students: MonthlyAttendanceRow[];
}

export interface StudentAttendanceRecord {
  id: string;
  date: string;
  status: AttendanceStatus;
  minutesLate: number | null;
  remarks: string | null;
  subject: { id: string; name: string; code: string } | null;
  period: { name: string; startTime: string } | null;
}

export interface StudentAttendance {
  summary: Record<AttendanceStatus, number>;
  totalMarked: number;
  percentage: number | null;
  records: StudentAttendanceRecord[];
}

export interface AttendanceTrendPoint {
  date: string;
  present: number;
  total: number;
  percentage: number | null;
}

export interface DailyAttendanceSummary {
  date: string;
  counts: Partial<Record<AttendanceStatus, number>>;
  total: number;
  percentage: number | null;
}

export interface Holiday {
  id: string;
  academicYearId: string;
  name: string;
  date: string;
  endDate: string | null;
  description: string | null;
}

export interface AttendanceRecordPayload {
  studentId: string;
  status: AttendanceStatus;
  minutesLate?: number;
  remarks?: string;
}

export interface MarkAttendancePayload {
  classId: string;
  sectionId: string;
  subjectId?: string | null;
  periodId?: string | null;
  date: string;
  records: AttendanceRecordPayload[];
  submit: boolean;
  remarks?: string;
}

export interface SessionQuery extends ListQueryParams {
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  status?: AttendanceSessionStatus;
  from?: string;
  to?: string;
}

export interface HolidayPayload {
  academicYearId: string;
  name: string;
  date: string;
  endDate?: string;
  description?: string;
}
