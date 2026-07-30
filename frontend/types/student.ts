import type { ListQueryParams } from './api';
import type { BloodGroup, Gender, StudentStatus, UserStatus } from './enums';
import type { AddressPayload, AddressRecord } from './teacher';

export type GuardianRelation = 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'SIBLING' | 'OTHER';

export const GUARDIAN_RELATION_LABELS: Record<GuardianRelation, string> = {
  FATHER: 'Father',
  MOTHER: 'Mother',
  GUARDIAN: 'Guardian',
  SIBLING: 'Sibling',
  OTHER: 'Other',
};

export type TimelineEventType =
  | 'ADMISSION'
  | 'PROMOTION'
  | 'TRANSFER'
  | 'ACHIEVEMENT'
  | 'DISCIPLINARY'
  | 'MEDICAL'
  | 'DOCUMENT'
  | 'FEE'
  | 'EXAM'
  | 'ATTENDANCE'
  | 'LEAVE'
  | 'GENERAL';

export const TIMELINE_EVENT_LABELS: Record<TimelineEventType, string> = {
  ADMISSION: 'Admission',
  PROMOTION: 'Promotion',
  TRANSFER: 'Transfer',
  ACHIEVEMENT: 'Achievement',
  DISCIPLINARY: 'Disciplinary',
  MEDICAL: 'Medical',
  DOCUMENT: 'Document',
  FEE: 'Fee',
  EXAM: 'Exam',
  ATTENDANCE: 'Attendance',
  LEAVE: 'Leave',
  GENERAL: 'General',
};

export interface GuardianRecord {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  relation: GuardianRelation;
  occupation: string | null;
  organization: string | null;
  phone: string;
  alternatePhone: string | null;
  email: string | null;
  annualIncome: string | null;
  aadhaarNumber: string | null;
  qualification: string | null;
  address: AddressRecord | null;
}

export interface StudentGuardianLink {
  id: string;
  relation: GuardianRelation;
  isPrimary: boolean;
  guardian: GuardianRecord;
}

export interface StudentListItem {
  id: string;
  admissionNumber: string;
  rollNumber: string | null;
  admissionDate: string;
  gender: Gender;
  dateOfBirth: string;
  bloodGroup: BloodGroup | null;
  status: StudentStatus;
  photoId: string | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    status: UserStatus;
  };
  class: { id: string; name: string; code: string } | null;
  section: { id: string; name: string } | null;
  academicYear: { id: string; name: string };
  guardians: {
    relation: GuardianRelation;
    guardian: { id: string; firstName: string; lastName: string; phone: string };
  }[];
}

export interface StudentDetail extends Omit<StudentListItem, 'guardians'> {
  academicYearId: string;
  classId: string | null;
  sectionId: string | null;
  aadhaarNumber: string | null;
  nationality: string;
  religion: string | null;
  category: string | null;
  motherTongue: string | null;
  previousSchool: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  permanentAddress: AddressRecord | null;
  currentAddress: AddressRecord | null;
  guardians: StudentGuardianLink[];
  electives: {
    id: string;
    classSubject: { id: string; subject: { id: string; name: string; code: string } };
  }[];
  _count: {
    attendanceRecords: number;
    invoices: number;
    documents: number;
    submissions: number;
  };
}

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  description: string | null;
  occurredAt: string;
  createdBy: { firstName: string; lastName: string } | null;
}

export interface EnrollmentHistoryEntry {
  id: string;
  type: string;
  effectiveDate: string;
  remarks: string | null;
  fromClass: { name: string } | null;
  toClass: { name: string } | null;
  fromSection: { name: string } | null;
  toSection: { name: string } | null;
}

export interface StudentTimeline {
  events: TimelineEvent[];
  enrollment: EnrollmentHistoryEntry[];
}

export interface StudentQuery extends ListQueryParams {
  academicYearId?: string;
  classId?: string;
  sectionId?: string;
  gender?: Gender;
  bloodGroup?: BloodGroup;
  status?: string;
  admittedFrom?: string;
  admittedTo?: string;
  includeArchived?: boolean;
}

export interface GuardianPayload {
  firstName: string;
  lastName: string;
  relation: GuardianRelation;
  occupation?: string;
  organization?: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  annualIncome?: number;
  aadhaarNumber?: string;
  qualification?: string;
  isPrimary: boolean;
  createPortalAccount: boolean;
  address?: AddressPayload;
}

export interface CreateStudentPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  admissionNumber?: string;
  rollNumber?: string;
  admissionDate: string;
  academicYearId: string;
  classId?: string | null;
  sectionId?: string | null;
  gender: Gender;
  dateOfBirth: string;
  bloodGroup?: BloodGroup | null;
  aadhaarNumber?: string;
  nationality: string;
  religion?: string;
  category?: string;
  motherTongue?: string;
  previousSchool?: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  permanentAddress?: AddressPayload;
  currentAddress?: AddressPayload;
  sameAsPermanent: boolean;
  guardians: GuardianPayload[];
  createPortalAccount: boolean;
}

export type UpdateStudentPayload = Partial<
  Omit<
    CreateStudentPayload,
    | 'admissionNumber'
    | 'admissionDate'
    | 'academicYearId'
    | 'guardians'
    | 'sameAsPermanent'
    | 'createPortalAccount'
  >
> & { status?: StudentStatus };

export interface CreateStudentResult {
  student: StudentDetail;
  provisionedAccounts: { email: string; temporaryPassword: string }[];
}

export interface PromotePayload {
  studentIds: string[];
  toAcademicYearId: string;
  toClassId: string;
  toSectionId?: string | null;
  effectiveDate: string;
  remarks?: string;
}

export interface PromoteResult {
  promoted: number;
  skipped: { studentId: string; reason: string }[];
}

export interface TransferPayload {
  toClassId: string;
  toSectionId?: string | null;
  effectiveDate: string;
  remarks?: string;
}

export interface IdCardData {
  institution: { name: string; code: string; logoId: string | null; phone: string } | null;
  student: {
    id: string;
    fullName: string;
    admissionNumber: string;
    rollNumber: string | null;
    className: string | null;
    sectionName: string | null;
    academicYear: string;
    dateOfBirth: string;
    bloodGroup: BloodGroup | null;
    photoId: string | null;
    emergencyContactName: string;
    emergencyContactPhone: string;
    address: AddressRecord | null;
  };
}
