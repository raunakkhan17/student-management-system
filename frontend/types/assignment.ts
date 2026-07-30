import type { ListQueryParams } from './api';

export type AssignmentStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';
export type SubmissionStatus = 'PENDING' | 'SUBMITTED' | 'LATE' | 'EVALUATED' | 'RESUBMIT';

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  PENDING: 'Not submitted',
  SUBMITTED: 'Submitted',
  LATE: 'Submitted late',
  EVALUATED: 'Marked',
  RESUBMIT: 'Resubmission requested',
};

export interface FileRef {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AssignmentAttachment {
  id: string;
  fileId: string;
  file: FileRef;
}

export interface SubmissionStudent {
  id: string;
  admissionNumber: string;
  rollNumber: string | null;
  user: { firstName: string; lastName: string };
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  content: string | null;
  status: SubmissionStatus;
  submittedAt: string | null;
  marksObtained: string | null;
  feedback: string | null;
  evaluatedAt: string | null;
  student: SubmissionStudent;
  attachments: { id: string; fileId: string; file: FileRef }[];
  evaluatedBy: { firstName: string; lastName: string } | null;
}

export interface AssignmentListItem {
  id: string;
  title: string;
  description: string;
  classId: string;
  sectionId: string | null;
  subjectId: string;
  teacherId: string;
  assignedDate: string;
  dueDate: string;
  maxMarks: string;
  status: AssignmentStatus;
  allowLateSubmission: boolean;
  publishedAt: string | null;
  class: { id: string; name: string; code: string };
  section: { id: string; name: string } | null;
  subject: { id: string; name: string; code: string };
  teacher: {
    id: string;
    employeeId: string;
    user: { firstName: string; lastName: string };
  };
  attachments: AssignmentAttachment[];
  _count: { submissions: number };
}

export interface AssignmentDetail extends AssignmentListItem {
  submissions: AssignmentSubmission[];
}

export interface AssignmentStats {
  total: number;
  published: number;
  awaitingEvaluation: number;
  overdue: number;
}

export interface AssignmentQuery extends ListQueryParams {
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  teacherId?: string;
  status?: string;
  dueFrom?: string;
  dueTo?: string;
  onlyPending?: boolean;
}

export interface CreateAssignmentFields {
  title: string;
  description: string;
  classId: string;
  sectionId?: string | null;
  subjectId: string;
  assignedDate: string;
  dueDate: string;
  maxMarks: number;
  allowLateSubmission: boolean;
  publish: boolean;
}

export interface UpdateAssignmentPayload {
  title?: string;
  description?: string;
  sectionId?: string | null;
  assignedDate?: string;
  dueDate?: string;
  maxMarks?: number;
  allowLateSubmission?: boolean;
  status?: AssignmentStatus;
}

export interface EvaluatePayload {
  marksObtained: number;
  feedback?: string;
  status: 'EVALUATED' | 'RESUBMIT';
}
