import { api, httpClient } from '@/lib/api-client';
import type { PaginatedData } from '@/types/api';
import type { StudentStatus } from '@/types/enums';
import type {
  CreateStudentPayload,
  CreateStudentResult,
  GuardianPayload,
  IdCardData,
  PromotePayload,
  PromoteResult,
  StudentDetail,
  StudentGuardianLink,
  StudentListItem,
  StudentQuery,
  StudentTimeline,
  TimelineEvent,
  TimelineEventType,
  TransferPayload,
  UpdateStudentPayload,
} from '@/types/student';

const BASE = '/students';

export const studentService = {
  list: (params: StudentQuery) => api.get<PaginatedData<StudentListItem>>(BASE, { params }),

  get: (id: string) => api.get<StudentDetail>(`${BASE}/${id}`),

  create: (payload: CreateStudentPayload) => api.post<CreateStudentResult>(BASE, payload),

  update: (id: string, payload: UpdateStudentPayload) =>
    api.patch<StudentDetail>(`${BASE}/${id}`, payload),

  remove: (id: string) => api.delete<null>(`${BASE}/${id}`),

  transfer: (id: string, payload: TransferPayload) =>
    api.post<StudentDetail>(`${BASE}/${id}/transfer`, payload),

  promote: (payload: PromotePayload) => api.post<PromoteResult>(`${BASE}/promote`, payload),

  changeStatus: (id: string, status: StudentStatus, remarks?: string) =>
    api.patch<StudentDetail>(`${BASE}/${id}/status`, { status, remarks }),

  getTimeline: (id: string) => api.get<StudentTimeline>(`${BASE}/${id}/timeline`),

  addTimelineEvent: (
    id: string,
    payload: { type: TimelineEventType; title: string; description?: string; occurredAt: string },
  ) => api.post<TimelineEvent>(`${BASE}/${id}/timeline`, payload),

  addGuardian: (id: string, payload: GuardianPayload) =>
    api.post<StudentGuardianLink[]>(`${BASE}/${id}/guardians`, payload),

  removeGuardian: (id: string, guardianId: string) =>
    api.delete<null>(`${BASE}/${id}/guardians/${guardianId}`),

  uploadPhoto: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('photo', file);
    return api.upload<StudentDetail>(`${BASE}/${id}/photo`, formData);
  },

  getIdCard: (id: string) => api.get<IdCardData>(`${BASE}/${id}/id-card`),

  /** Streams a file, so it bypasses the JSON envelope unwrapping. */
  exportStudents: async (params: StudentQuery & { format: 'csv' | 'xlsx' }) => {
    const response = await httpClient.get<Blob>(`${BASE}/export`, {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
};
