import type { UserRole, UserStatus } from './enums';

export interface StudentSummary {
  id: string;
  admissionNumber: string;
  rollNumber: string | null;
  classId: string | null;
  sectionId: string | null;
  class: { id: string; name: string } | null;
  section: { id: string; name: string } | null;
}

export interface TeacherSummary {
  id: string;
  employeeId: string;
  designation: string;
  departmentId: string | null;
  department: { id: string; name: string } | null;
}

export interface GuardianChild {
  isPrimary: boolean;
  student: {
    id: string;
    admissionNumber: string;
    user: { firstName: string; lastName: string };
    class: { id: string; name: string } | null;
    section: { id: string; name: string } | null;
  };
}

export interface GuardianSummary {
  id: string;
  relation: string;
  students: GuardianChild[];
}

/** Shape returned by `GET /auth/me` and `POST /auth/login`. */
export interface AuthUser {
  id: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  firstName: string;
  lastName: string;
  avatarId: string | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  studentProfile: StudentSummary | null;
  teacherProfile: TeacherSummary | null;
  guardianProfile: GuardianSummary | null;
}

export interface LoginPayload {
  email: string;
  password: string;
  rememberMe: boolean;
  role?: UserRole;
}

export interface LoginResponse {
  user: AuthUser;
  permissions: string[];
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface ProfileResponse {
  user: AuthUser;
  permissions: string[];
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}
