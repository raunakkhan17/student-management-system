import type { ListQueryParams } from './api';
import type { UserRole } from './enums';
import type { RequestStatus } from './hostel';

export type LeaveType =
  | 'SICK'
  | 'CASUAL'
  | 'EMERGENCY'
  | 'VACATION'
  | 'MATERNITY'
  | 'UNPAID'
  | 'OTHER';

export type ApplicantType = 'STUDENT' | 'TEACHER';

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  SICK: 'Sick',
  CASUAL: 'Casual',
  EMERGENCY: 'Emergency',
  VACATION: 'Vacation',
  MATERNITY: 'Maternity',
  UNPAID: 'Unpaid',
  OTHER: 'Other',
};

export const APPLICANT_TYPE_LABELS: Record<ApplicantType, string> = {
  STUDENT: 'Student',
  TEACHER: 'Staff',
};

export const LEAVE_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export interface LeaveRequest {
  id: string;
  applicantId: string;
  applicantType: ApplicantType;
  type: LeaveType;
  fromDate: string;
  toDate: string;
  totalDays: string;
  reason: string;
  status: RequestStatus;
  attachmentId: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  appliedAt: string;
  applicant: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
    studentProfile: {
      admissionNumber: string;
      class: { name: string } | null;
      section: { name: string } | null;
    } | null;
    teacherProfile: { employeeId: string; department: { name: string } | null } | null;
  };
  reviewedBy: { id: string; firstName: string; lastName: string } | null;
  attachment: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  } | null;
}

export interface LeaveCalendarEntry {
  id: string;
  applicantId: string;
  applicantName: string;
  applicantType: ApplicantType;
  identifier: string | null;
  type: LeaveType;
  status: RequestStatus;
  fromDate: string;
  toDate: string;
  totalDays: string;
}

export interface LeaveBalanceRow {
  type: LeaveType;
  allocated: string;
  used: string;
  remaining: string;
}

export interface LeaveBalances {
  userId: string;
  academicYearId: string | null;
  balances: LeaveBalanceRow[];
}

export interface LeaveStats {
  pending: number;
  approved: number;
  rejected: number;
  onLeaveToday: number;
}

// -------------------------------------------------------------------- Payloads

export interface ApplyLeavePayload {
  applicantId?: string;
  type: LeaveType;
  fromDate: string;
  toDate: string;
  totalDays?: number;
  reason: string;
  attachmentId?: string | null;
}

export interface ReviewLeavePayload {
  status: 'APPROVED' | 'REJECTED';
  reviewComment?: string;
}

export interface SaveLeaveBalancesPayload {
  userId: string;
  academicYearId: string;
  balances: { type: LeaveType; allocated: number }[];
}

export interface LeaveQuery extends ListQueryParams {
  applicantId?: string;
  applicantType?: ApplicantType;
  type?: LeaveType;
  status?: string;
  from?: string;
  to?: string;
}
