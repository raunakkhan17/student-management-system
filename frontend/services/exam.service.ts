import { api } from '@/lib/api-client';
import type { PaginatedData } from '@/types/api';
import type {
  ExamDetail,
  ExamListItem,
  ExamPayload,
  ExamQuery,
  ExamSchedule,
  ExamStatistics,
  GradeScale,
  MarkEntryPayload,
  MarksProgressRow,
  MarksSheet,
  RankingRow,
  ReportCardDetail,
  ReportCardRecord,
  SchedulePayload,
} from '@/types/exam';

const BASE = '/exams';

export const examService = {
  list: (params: ExamQuery) => api.get<PaginatedData<ExamListItem>>(BASE, { params }),

  get: (id: string) => api.get<ExamDetail>(`${BASE}/${id}`),

  create: (payload: ExamPayload) => api.post<ExamDetail>(BASE, payload),

  update: (id: string, payload: Partial<ExamPayload> & { status?: string }) =>
    api.patch<ExamDetail>(`${BASE}/${id}`, payload),

  remove: (id: string) => api.delete<null>(`${BASE}/${id}`),

  // Papers
  addSchedule: (examId: string, payload: SchedulePayload) =>
    api.post<ExamSchedule>(`${BASE}/${examId}/schedules`, payload),

  updateSchedule: (examId: string, scheduleId: string, payload: Partial<SchedulePayload>) =>
    api.patch<ExamSchedule>(`${BASE}/${examId}/schedules/${scheduleId}`, payload),

  deleteSchedule: (examId: string, scheduleId: string) =>
    api.delete<null>(`${BASE}/${examId}/schedules/${scheduleId}`),

  // Marks
  getMarksSheet: (scheduleId: string) => api.get<MarksSheet>(`${BASE}/papers/${scheduleId}/marks`),

  saveMarks: (scheduleId: string, marks: MarkEntryPayload[]) =>
    api.put<MarksSheet>(`${BASE}/papers/${scheduleId}/marks`, { marks }),

  getProgress: (examId: string) => api.get<MarksProgressRow[]>(`${BASE}/${examId}/progress`),

  // Results
  publish: (examId: string, allowIncomplete: boolean) =>
    api.post<{ published: number; ranked: number }>(`${BASE}/${examId}/publish`, {
      allowIncomplete,
    }),

  withdraw: (examId: string) => api.post<null>(`${BASE}/${examId}/withdraw`),

  getRankings: (examId: string) => api.get<RankingRow[]>(`${BASE}/${examId}/rankings`),

  getStatistics: (examId: string) => api.get<ExamStatistics>(`${BASE}/${examId}/statistics`),

  // Report cards
  listReportCards: (params: ExamQuery & { examId?: string; studentId?: string }) =>
    api.get<PaginatedData<ReportCardRecord>>(`${BASE}/report-cards`, { params }),

  getReportCard: (id: string) => api.get<ReportCardDetail>(`${BASE}/report-cards/${id}`),

  getStudentResult: (studentId: string, examId: string) =>
    api.get<ReportCardDetail>(`${BASE}/results/${studentId}/${examId}`),

  // Grade scales
  listGradeScales: () => api.get<GradeScale[]>(`${BASE}/grade-scales`),
};
