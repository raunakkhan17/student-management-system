import type { ListQueryParams } from './api';

export type ExamType = 'UNIT_TEST' | 'MID_SEMESTER' | 'SEMESTER' | 'FINAL' | 'PRACTICAL';

export type ExamStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'ONGOING'
  | 'COMPLETED'
  | 'RESULTS_PUBLISHED'
  | 'CANCELLED';

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  UNIT_TEST: 'Unit test',
  MID_SEMESTER: 'Mid semester',
  SEMESTER: 'Semester',
  FINAL: 'Final',
  PRACTICAL: 'Practical',
};

export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  ONGOING: 'Ongoing',
  COMPLETED: 'Completed',
  RESULTS_PUBLISHED: 'Results published',
  CANCELLED: 'Cancelled',
};

export interface GradeBand {
  id: string;
  grade: string;
  minPercent: string;
  maxPercent: string;
  gradePoint: string;
  description: string | null;
  isPass: boolean;
}

export interface GradeScale {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  bands: GradeBand[];
}

export interface ExamListItem {
  id: string;
  name: string;
  type: ExamType;
  academicYearId: string;
  semesterId: string | null;
  classId: string | null;
  startDate: string;
  endDate: string;
  status: ExamStatus;
  description: string | null;
  gradeScaleId: string | null;
  resultsPublishedAt: string | null;
  academicYear: { id: string; name: string };
  semester: { id: string; name: string } | null;
  class: { id: string; name: string; code: string } | null;
  gradeScale: { id: string; name: string } | null;
  createdBy: { firstName: string; lastName: string } | null;
  _count: { schedules: number; reportCards: number };
}

export interface ExamSchedule {
  id: string;
  examId: string;
  classId: string;
  sectionId: string | null;
  subjectId: string;
  examDate: string;
  startTime: string;
  endTime: string;
  roomId: string | null;
  invigilatorId: string | null;
  maxMarks: string;
  passingMarks: string;
  weightage: string;
  instructions: string | null;
  class: { id: string; name: string; code: string };
  section: { id: string; name: string } | null;
  subject: { id: string; name: string; code: string };
  room: { id: string; name: string; code: string } | null;
  invigilator: {
    id: string;
    employeeId: string;
    user: { firstName: string; lastName: string };
  } | null;
  _count: { marks: number };
}

export interface ExamDetail extends ExamListItem {
  schedules: ExamSchedule[];
}

export interface MarksSheetStudent {
  studentId: string;
  admissionNumber: string;
  rollNumber: string | null;
  firstName: string;
  lastName: string;
  marksObtained: string | null;
  isAbsent: boolean;
  grade: string | null;
  remarks: string | null;
}

export interface MarksSheet {
  schedule: {
    id: string;
    examId: string;
    examName: string;
    examStatus: ExamStatus;
    className: string;
    sectionName: string | null;
    subject: { id: string; name: string; code: string };
    examDate: string;
    maxMarks: string;
    passingMarks: string;
    isLocked: boolean;
  };
  students: MarksSheetStudent[];
}

export interface MarksProgressRow {
  scheduleId: string;
  subject: { id: string; name: string; code: string };
  class: { id: string; name: string };
  section: { id: string; name: string } | null;
  entered: number;
  expected: number;
  isComplete: boolean;
}

export interface RankingRow {
  rank: number | null;
  studentId: string;
  admissionNumber: string;
  rollNumber: string | null;
  name: string;
  className: string | null;
  sectionName: string | null;
  obtainedMarks: string;
  totalMarks: string;
  percentage: string;
  grade: string | null;
  gpa: string | null;
  isPass: boolean;
}

export interface ExamStatistics {
  studentCount: number;
  passCount: number;
  failCount: number;
  passRate: number | null;
  averagePercentage: number | null;
  highestPercentage: number | null;
  lowestPercentage: number | null;
  gradeDistribution: { grade: string; count: number }[];
}

export interface ReportCardRecord {
  id: string;
  studentId: string;
  examId: string;
  totalMarks: string;
  obtainedMarks: string;
  percentage: string;
  grade: string | null;
  gpa: string | null;
  rank: number | null;
  attendancePercent: string | null;
  isPass: boolean;
  remarks: string | null;
  publishedAt: string | null;
  student: {
    id: string;
    admissionNumber: string;
    rollNumber: string | null;
    user: { firstName: string; lastName: string };
    class: { id: string; name: string } | null;
    section: { id: string; name: string } | null;
  };
  exam: { id: string; name: string; type: ExamType; startDate: string; endDate: string };
  academicYear: { id: string; name: string };
  generatedBy: { firstName: string; lastName: string } | null;
}

export interface ReportCardSubjectRow {
  subject: { id: string; name: string; code: string };
  examDate: string;
  maxMarks: string;
  passingMarks: string;
  marksObtained: string | null;
  isAbsent: boolean;
  grade: string | null;
  gradePoint: string | null;
  isPass: boolean;
  remarks: string | null;
}

export interface ReportCardDetail {
  institution: {
    name: string;
    code: string;
    logoId: string | null;
    principalName: string | null;
  } | null;
  card: ReportCardRecord;
  subjects: ReportCardSubjectRow[];
}

export interface ExamQuery extends ListQueryParams {
  academicYearId?: string;
  semesterId?: string;
  classId?: string;
  type?: ExamType;
  status?: string;
}

export interface ExamPayload {
  name: string;
  type: ExamType;
  academicYearId: string;
  semesterId?: string | null;
  classId?: string | null;
  startDate: string;
  endDate: string;
  gradeScaleId?: string | null;
  description?: string;
}

export interface SchedulePayload {
  classId: string;
  sectionId?: string | null;
  subjectId: string;
  examDate: string;
  startTime: string;
  endTime: string;
  roomId?: string | null;
  invigilatorId?: string | null;
  maxMarks: number;
  passingMarks: number;
  weightage: number;
  instructions?: string;
}

export interface MarkEntryPayload {
  studentId: string;
  marksObtained?: number | null;
  isAbsent: boolean;
  remarks?: string;
}
