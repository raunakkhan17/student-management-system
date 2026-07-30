import { api, httpClient } from '@/lib/api-client';
import type { PaginatedData } from '@/types/api';
import type {
  CreateTeacherPayload,
  CreateTeacherResult,
  EmployeeStatus,
  SalaryPayload,
  TeacherDetail,
  TeacherListItem,
  TeacherOptionItem,
  TeacherQuery,
  UpdateTeacherPayload,
} from '@/types/teacher';

const BASE = '/teachers';

export const teacherService = {
  list: (params: TeacherQuery) => api.get<PaginatedData<TeacherListItem>>(BASE, { params }),

  listOptions: (departmentId?: string) =>
    api.get<TeacherOptionItem[]>(`${BASE}/options`, {
      params: departmentId ? { departmentId } : {},
    }),

  get: (id: string) => api.get<TeacherDetail>(`${BASE}/${id}`),

  create: (payload: CreateTeacherPayload) => api.post<CreateTeacherResult>(BASE, payload),

  update: (id: string, payload: UpdateTeacherPayload) =>
    api.patch<TeacherDetail>(`${BASE}/${id}`, payload),

  remove: (id: string) => api.delete<null>(`${BASE}/${id}`),

  assignSubjects: (id: string, subjectIds: string[]) =>
    api.put<TeacherDetail>(`${BASE}/${id}/subjects`, { subjectIds }),

  assignClass: (id: string, payload: { classId?: string | null; sectionId?: string | null }) =>
    api.post<TeacherDetail>(`${BASE}/${id}/assign-class`, payload),

  addSalary: (id: string, payload: SalaryPayload) =>
    api.post<TeacherDetail>(`${BASE}/${id}/salary`, payload),

  changeStatus: (id: string, status: EmployeeStatus, remarks?: string) =>
    api.patch<TeacherDetail>(`${BASE}/${id}/status`, { status, remarks }),

  uploadPhoto: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('photo', file);
    return api.upload<TeacherDetail>(`${BASE}/${id}/photo`, formData);
  },

  /** Streams a file, so it bypasses the JSON envelope unwrapping. */
  exportTeachers: async (params: TeacherQuery & { format: 'csv' | 'xlsx' }) => {
    const response = await httpClient.get<Blob>(`${BASE}/export`, {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
};
