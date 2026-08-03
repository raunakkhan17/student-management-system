import type { AppModule, PermissionAction, UserRole } from './enums';

export interface InstitutionAddress {
  id?: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface Institution {
  id: string;
  name: string;
  code: string;
  email: string;
  phone: string;
  website: string | null;
  establishedYear: number | null;
  affiliation: string | null;
  principalName: string | null;
  currency: string;
  timezone: string;
  logoId: string | null;
  logo: { id: string; originalName: string; mimeType: string } | null;
  address: InstitutionAddress | null;
}

export type InstitutionPayload = Omit<Institution, 'id' | 'logo' | 'address'> & {
  address?: Omit<InstitutionAddress, 'id'>;
};

export interface AttendanceRules {
  id: string;
  academicYearId: string;
  /** Decimal, serialised as a string. */
  minAttendancePercent: string;
  lateThresholdMinutes: number;
  halfDayThresholdMinutes: number;
  autoLockAfterHours: number;
  allowBackdatedDays: number;
  countLateAsPresent: boolean;
  academicYear?: { id: string; name: string };
}

export interface AttendanceRulesPayload {
  academicYearId?: string;
  minAttendancePercent: number;
  lateThresholdMinutes: number;
  halfDayThresholdMinutes: number;
  autoLockAfterHours: number;
  allowBackdatedDays: number;
  countLateAsPresent: boolean;
}

export interface EmailTemplateSummary {
  id: string;
  key: string;
  name: string;
  subject: string;
  description: string | null;
  variables: string[] | null;
  isActive: boolean;
  updatedAt: string;
}

export interface PermissionMatrix {
  roles: UserRole[];
  /** role → module → granted actions. Absent module means no grant at all. */
  matrix: Record<string, Record<string, PermissionAction[]>>;
  totalGrants: number;
}

export type { AppModule };
