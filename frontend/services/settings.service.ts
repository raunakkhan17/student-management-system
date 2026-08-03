import { api } from '@/lib/api-client';
import type {
  AttendanceRules,
  AttendanceRulesPayload,
  EmailTemplateSummary,
  Institution,
  InstitutionPayload,
  PermissionMatrix,
} from '@/types/settings';

const BASE = '/settings';

export const settingsService = {
  /** Null before the institution profile has ever been saved. */
  getInstitution: () => api.get<Institution | null>(`${BASE}/institution`),
  saveInstitution: (payload: InstitutionPayload) =>
    api.put<Institution>(`${BASE}/institution`, payload),

  getAttendanceRules: (academicYearId?: string) =>
    api.get<AttendanceRules>(`${BASE}/attendance-rules`, {
      params: academicYearId ? { academicYearId } : {},
    }),
  saveAttendanceRules: (payload: AttendanceRulesPayload) =>
    api.put<AttendanceRules>(`${BASE}/attendance-rules`, payload),

  listEmailTemplates: () => api.get<EmailTemplateSummary[]>(`${BASE}/email-templates`),
  getPermissionMatrix: () => api.get<PermissionMatrix>(`${BASE}/permissions`),
};
