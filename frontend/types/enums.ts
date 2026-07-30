/** Mirrors the Prisma enums exposed by the API. Kept as const objects so the
 *  values are usable at runtime (dropdowns, badges) as well as in types. */

export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
  ACCOUNTANT: 'ACCOUNTANT',
  LIBRARIAN: 'LIBRARIAN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  PENDING: 'PENDING',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const AppModule = {
  DASHBOARD: 'DASHBOARD',
  USERS: 'USERS',
  STUDENTS: 'STUDENTS',
  TEACHERS: 'TEACHERS',
  ACADEMICS: 'ACADEMICS',
  ATTENDANCE: 'ATTENDANCE',
  EXAMS: 'EXAMS',
  ASSIGNMENTS: 'ASSIGNMENTS',
  TIMETABLE: 'TIMETABLE',
  FEES: 'FEES',
  LIBRARY: 'LIBRARY',
  HOSTEL: 'HOSTEL',
  TRANSPORT: 'TRANSPORT',
  LEAVE: 'LEAVE',
  NOTICES: 'NOTICES',
  COMMUNICATION: 'COMMUNICATION',
  DOCUMENTS: 'DOCUMENTS',
  REPORTS: 'REPORTS',
  SETTINGS: 'SETTINGS',
  AUDIT_LOGS: 'AUDIT_LOGS',
} as const;
export type AppModule = (typeof AppModule)[keyof typeof AppModule];

export const PermissionAction = {
  VIEW: 'VIEW',
  CREATE: 'CREATE',
  EDIT: 'EDIT',
  DELETE: 'DELETE',
  APPROVE: 'APPROVE',
  EXPORT: 'EXPORT',
  ASSIGN: 'ASSIGN',
} as const;
export type PermissionAction = (typeof PermissionAction)[keyof typeof PermissionAction];

export const Gender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  OTHER: 'OTHER',
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];

export const BloodGroup = {
  A_POSITIVE: 'A_POSITIVE',
  A_NEGATIVE: 'A_NEGATIVE',
  B_POSITIVE: 'B_POSITIVE',
  B_NEGATIVE: 'B_NEGATIVE',
  AB_POSITIVE: 'AB_POSITIVE',
  AB_NEGATIVE: 'AB_NEGATIVE',
  O_POSITIVE: 'O_POSITIVE',
  O_NEGATIVE: 'O_NEGATIVE',
} as const;
export type BloodGroup = (typeof BloodGroup)[keyof typeof BloodGroup];

export const StudentStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  GRADUATED: 'GRADUATED',
  TRANSFERRED: 'TRANSFERRED',
  ARCHIVED: 'ARCHIVED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type StudentStatus = (typeof StudentStatus)[keyof typeof StudentStatus];

/** Human-readable labels for enum values shown in the UI. */
export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  PARENT: 'Parent',
  ACCOUNTANT: 'Accountant',
  LIBRARIAN: 'Librarian',
};

export const BLOOD_GROUP_LABELS: Record<BloodGroup, string> = {
  A_POSITIVE: 'A+',
  A_NEGATIVE: 'A−',
  B_POSITIVE: 'B+',
  B_NEGATIVE: 'B−',
  AB_POSITIVE: 'AB+',
  AB_NEGATIVE: 'AB−',
  O_POSITIVE: 'O+',
  O_NEGATIVE: 'O−',
};

export const GENDER_LABELS: Record<Gender, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
  PENDING: 'Pending',
};

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  GRADUATED: 'Graduated',
  TRANSFERRED: 'Transferred',
  ARCHIVED: 'Archived',
  SUSPENDED: 'Suspended',
};
