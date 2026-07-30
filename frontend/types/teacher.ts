import type { ListQueryParams } from './api';
import type { BloodGroup, Gender, UserStatus } from './enums';

export type EmployeeStatus =
  | 'ACTIVE'
  | 'ON_LEAVE'
  | 'RESIGNED'
  | 'RETIRED'
  | 'TERMINATED'
  | 'SUSPENDED';

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'VISITING';

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: 'Active',
  ON_LEAVE: 'On leave',
  RESIGNED: 'Resigned',
  RETIRED: 'Retired',
  TERMINATED: 'Terminated',
  SUSPENDED: 'Suspended',
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  CONTRACT: 'Contract',
  VISITING: 'Visiting',
};

export interface AddressRecord {
  id: string;
  type: 'PERMANENT' | 'CURRENT' | 'OFFICE';
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface AddressPayload {
  type: 'PERMANENT' | 'CURRENT' | 'OFFICE';
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface TeacherListItem {
  id: string;
  employeeId: string;
  designation: string;
  qualification: string;
  specialization: string | null;
  experienceYears: number;
  joiningDate: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  gender: Gender;
  photoId: string | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    status: UserStatus;
  };
  department: { id: string; name: string; code: string } | null;
  subjects: { subject: { id: string; name: string; code: string } }[];
  _count: { classSubjects: number; classTeacherOf: number; sectionTeacherOf: number };
}

export interface TeacherSalaryRecord {
  id: string;
  basicSalary: string;
  allowances: string;
  deductions: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  remarks: string | null;
}

export interface TeacherDetail extends Omit<TeacherListItem, '_count'> {
  dateOfBirth: string | null;
  bloodGroup: BloodGroup | null;
  departmentId: string | null;
  address: AddressRecord | null;
  salaries: TeacherSalaryRecord[];
  classTeacherOf: { id: string; name: string; code: string; academicYear: { name: string } }[];
  sectionTeacherOf: { id: string; name: string; class: { id: string; name: string } }[];
  classSubjects: {
    id: string;
    subject: { id: string; name: string; code: string };
    class: { id: string; name: string };
    section: { id: string; name: string } | null;
    semester: { id: string; name: string } | null;
  }[];
}

export interface TeacherOptionItem {
  id: string;
  employeeId: string;
  designation: string;
  user: { firstName: string; lastName: string };
}

export interface TeacherQuery extends ListQueryParams {
  departmentId?: string;
  subjectId?: string;
  status?: string;
  employmentType?: EmploymentType;
  gender?: Gender;
  includeArchived?: boolean;
}

export interface SalaryPayload {
  basicSalary: number;
  allowances: number;
  deductions: number;
  effectiveFrom: string;
  effectiveTo?: string;
  remarks?: string;
}

export interface CreateTeacherPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  employeeId?: string;
  departmentId?: string | null;
  designation: string;
  qualification: string;
  specialization?: string;
  experienceYears: number;
  joiningDate: string;
  employmentType: EmploymentType;
  gender: Gender;
  dateOfBirth?: string;
  bloodGroup?: BloodGroup | null;
  address?: AddressPayload;
  subjectIds: string[];
  salary?: SalaryPayload;
  createPortalAccount: boolean;
}

export type UpdateTeacherPayload = Partial<
  Omit<CreateTeacherPayload, 'subjectIds' | 'salary' | 'createPortalAccount' | 'employeeId'>
> & {
  status?: EmployeeStatus;
};

export interface CreateTeacherResult {
  teacher: TeacherDetail;
  provisionedAccount: { email: string; temporaryPassword: string } | null;
}
