import { api, httpClient } from '@/lib/api-client';
import type { PaginatedData } from '@/types/api';
import type {
  AttendanceSessionListItem,
  AttendanceSheet,
  AttendanceTrendPoint,
  DailyAttendanceSummary,
  Holiday,
  HolidayPayload,
  MarkAttendancePayload,
  MonthlyAttendance,
  SessionQuery,
  StudentAttendance,
} from '@/types/attendance';
import type { ListQueryParams } from '@/types/api';

const BASE = '/attendance';

export const attendanceService = {
  /** Roster for a class/section on a date, pre-filled with existing marks. */
  getSheet: (params: {
    classId: string;
    sectionId: string;
    subjectId?: string;
    periodId?: string;
    date: string;
  }) => api.get<AttendanceSheet>(`${BASE}/sheet`, { params }),

  mark: (payload: MarkAttendancePayload) => api.post<unknown>(BASE, payload),

  listSessions: (params: SessionQuery) =>
    api.get<PaginatedData<AttendanceSessionListItem>>(`${BASE}/sessions`, { params }),

  getSession: (id: string) => api.get<unknown>(`${BASE}/sessions/${id}`),

  updateSession: (
    id: string,
    payload: { records: MarkAttendancePayload['records']; remarks?: string },
  ) => api.patch<unknown>(`${BASE}/sessions/${id}`, payload),

  lockSession: (id: string) => api.post<unknown>(`${BASE}/sessions/${id}/lock`),

  unlockSession: (id: string) => api.post<unknown>(`${BASE}/sessions/${id}/unlock`),

  getPending: () => api.get<AttendanceSessionListItem[]>(`${BASE}/pending`),

  getMonthly: (params: {
    classId?: string;
    sectionId?: string;
    studentId?: string;
    year: number;
    month: number;
  }) => api.get<MonthlyAttendance>(`${BASE}/monthly`, { params }),

  getStudentAttendance: (studentId: string, params?: { from?: string; to?: string }) =>
    api.get<StudentAttendance>(`${BASE}/students/${studentId}`, { params: params ?? {} }),

  getDailySummary: (date?: string) =>
    api.get<DailyAttendanceSummary>(`${BASE}/summary/daily`, { params: date ? { date } : {} }),

  getTrend: (params?: { from?: string; to?: string }) =>
    api.get<AttendanceTrendPoint[]>(`${BASE}/summary/trend`, { params: params ?? {} }),

  listHolidays: (params: ListQueryParams & { academicYearId?: string }) =>
    api.get<PaginatedData<Holiday>>(`${BASE}/holidays`, { params }),

  createHoliday: (payload: HolidayPayload) => api.post<Holiday>(`${BASE}/holidays`, payload),

  updateHoliday: (id: string, payload: Partial<Omit<HolidayPayload, 'academicYearId'>>) =>
    api.patch<Holiday>(`${BASE}/holidays/${id}`, payload),

  deleteHoliday: (id: string) => api.delete<null>(`${BASE}/holidays/${id}`),

  /** Streams a file, so it bypasses the JSON envelope unwrapping. */
  exportReport: async (params: {
    classId?: string;
    sectionId?: string;
    from: string;
    to: string;
    format: 'csv' | 'xlsx';
  }) => {
    const response = await httpClient.get<Blob>(`${BASE}/report`, {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
};
