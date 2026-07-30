import { api } from '@/lib/api-client';
import type { PaginatedData } from '@/types/api';
import type {
  ApplicantType,
  ApplyLeavePayload,
  LeaveBalances,
  LeaveCalendarEntry,
  LeaveQuery,
  LeaveRequest,
  LeaveStats,
  ReviewLeavePayload,
  SaveLeaveBalancesPayload,
} from '@/types/leave';

const BASE = '/leave';

export const leaveService = {
  getStats: () => api.get<LeaveStats>(`${BASE}/stats`),

  list: (params: LeaveQuery) => api.get<PaginatedData<LeaveRequest>>(BASE, { params }),
  get: (id: string) => api.get<LeaveRequest>(`${BASE}/${id}`),
  apply: (payload: ApplyLeavePayload) => api.post<LeaveRequest>(BASE, payload),
  review: (id: string, payload: ReviewLeavePayload) =>
    api.post<LeaveRequest>(`${BASE}/${id}/review`, payload),
  cancel: (id: string) => api.post<LeaveRequest>(`${BASE}/${id}/cancel`),

  getCalendar: (params: { from: string; to: string; applicantType?: ApplicantType }) =>
    api.get<LeaveCalendarEntry[]>(`${BASE}/calendar`, { params }),

  getBalances: (params?: { userId?: string; academicYearId?: string }) =>
    api.get<LeaveBalances>(`${BASE}/balances`, { params: params ?? {} }),
  saveBalances: (payload: SaveLeaveBalancesPayload) =>
    api.put<LeaveBalances['balances']>(`${BASE}/balances`, payload),
};
