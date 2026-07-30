import type { ListQueryParams } from './api';

export type AcademicTermStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type SubjectType = 'CORE' | 'ELECTIVE' | 'PRACTICAL' | 'LANGUAGE' | 'ACTIVITY';

export const ACADEMIC_TERM_STATUS_LABELS: Record<AcademicTermStatus, string> = {
  UPCOMING: 'Upcoming',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
  CORE: 'Core',
  ELECTIVE: 'Elective',
  PRACTICAL: 'Practical',
  LANGUAGE: 'Language',
  ACTIVITY: 'Activity',
};

export interface TeacherRef {
  id: string;
  employeeId: string;
  user: { firstName: string; lastName: string };
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: AcademicTermStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description: string | null;
  headTeacherId: string | null;
  headTeacher: TeacherRef | null;
  _count: { courses: number; classes: number; subjects: number; teachers: number };
  createdAt: string;
}

export interface Course {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  durationYears: number;
  description: string | null;
  department: { id: string; name: string; code: string };
  _count: { classes: number };
  createdAt: string;
}

export interface SectionSummary {
  id: string;
  name: string;
  capacity: number;
  _count: { students: number };
}

export interface ClassRecord {
  id: string;
  name: string;
  code: string;
  academicYearId: string;
  departmentId: string | null;
  courseId: string | null;
  yearLevel: number;
  capacity: number;
  classTeacherId: string | null;
  academicYear: { id: string; name: string; isCurrent: boolean };
  department: { id: string; name: string } | null;
  course: { id: string; name: string; code: string } | null;
  classTeacher: TeacherRef | null;
  sections: SectionSummary[];
  _count: { students: number; classSubjects: number };
  createdAt: string;
}

export interface Section {
  id: string;
  name: string;
  classId: string;
  capacity: number;
  classTeacherId: string | null;
  roomId: string | null;
  class: { id: string; name: string; code: string; academicYear: { id: string; name: string } };
  classTeacher: TeacherRef | null;
  room: { id: string; name: string; code: string } | null;
  _count: { students: number };
  createdAt: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  departmentId: string | null;
  type: SubjectType;
  credits: number;
  description: string | null;
  department: { id: string; name: string; code: string } | null;
  _count: { classSubjects: number; teacherSubjects: number };
  createdAt: string;
}

export interface Semester {
  id: string;
  name: string;
  academicYearId: string;
  startDate: string;
  endDate: string;
  status: AcademicTermStatus;
  academicYear: { id: string; name: string; startDate: string; endDate: string };
  _count: { classSubjects: number; exams: number };
  createdAt: string;
}

export interface SubjectOffering {
  id: string;
  classId: string;
  sectionId: string | null;
  subjectId: string;
  semesterId: string | null;
  teacherId: string | null;
  isElective: boolean;
  class: { id: string; name: string; code: string };
  section: { id: string; name: string } | null;
  subject: { id: string; name: string; code: string; type: SubjectType; credits: number };
  semester: { id: string; name: string } | null;
  teacher: TeacherRef | null;
  _count: { electiveEnrollments: number };
}

/** Compact shapes used to populate pickers. */
export interface ClassOption {
  id: string;
  name: string;
  code: string;
  sections: { id: string; name: string }[];
}

export interface SubjectOption {
  id: string;
  name: string;
  code: string;
  type: SubjectType;
  credits: number;
}

export interface TeacherOption {
  id: string;
  employeeId: string;
  designation: string;
  user: { firstName: string; lastName: string };
}

// -------------------------------------------------------------- Query params

export interface AcademicYearQuery extends ListQueryParams {
  status?: AcademicTermStatus;
  isCurrent?: boolean;
}

export interface CourseQuery extends ListQueryParams {
  departmentId?: string;
}

export interface ClassQuery extends ListQueryParams {
  academicYearId?: string;
  departmentId?: string;
  courseId?: string;
}

export interface SectionQuery extends ListQueryParams {
  classId?: string;
}

export interface SubjectQuery extends ListQueryParams {
  departmentId?: string;
  type?: SubjectType;
}

export interface SemesterQuery extends ListQueryParams {
  academicYearId?: string;
  status?: AcademicTermStatus;
}

export interface OfferingQuery extends ListQueryParams {
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  teacherId?: string;
  semesterId?: string;
  isElective?: boolean;
}

// -------------------------------------------------------------- Payloads

export interface AcademicYearPayload {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: AcademicTermStatus;
}

export interface DepartmentPayload {
  name: string;
  code: string;
  description?: string;
  headTeacherId?: string | null;
}

export interface CoursePayload {
  name: string;
  code: string;
  departmentId: string;
  durationYears: number;
  description?: string;
}

export interface ClassPayload {
  name: string;
  code: string;
  academicYearId: string;
  departmentId?: string | null;
  courseId?: string | null;
  yearLevel: number;
  capacity: number;
  classTeacherId?: string | null;
}

export interface SectionPayload {
  name: string;
  classId: string;
  capacity: number;
  classTeacherId?: string | null;
  roomId?: string | null;
}

export interface SubjectPayload {
  name: string;
  code: string;
  departmentId?: string | null;
  type: SubjectType;
  credits: number;
  description?: string;
}

export interface SemesterPayload {
  name: string;
  academicYearId: string;
  startDate: string;
  endDate: string;
  status: AcademicTermStatus;
}

export interface OfferingPayload {
  classId: string;
  sectionId?: string | null;
  subjectId: string;
  semesterId?: string | null;
  teacherId?: string | null;
  isElective: boolean;
}
