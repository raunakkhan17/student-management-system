import { api } from '@/lib/api-client';
import type { ListQueryParams, PaginatedData } from '@/types/api';
import type {
  ConflictCheckResult,
  PeriodPayload,
  Room,
  RoomOption,
  RoomPayload,
  RoomType,
  SlotPayload,
  TeacherTimetableSlot,
  Timetable,
  TimetableListItem,
  TimetablePayload,
  TimetablePeriod,
  TimetableQuery,
} from '@/types/timetable';

const BASE = '/timetable';

export const timetableService = {
  // Rooms
  listRooms: (params: ListQueryParams & { type?: RoomType }) =>
    api.get<PaginatedData<Room>>(`${BASE}/rooms`, { params }),
  listRoomOptions: () => api.get<RoomOption[]>(`${BASE}/rooms/options`),
  createRoom: (payload: RoomPayload) => api.post<Room>(`${BASE}/rooms`, payload),
  updateRoom: (id: string, payload: Partial<RoomPayload>) =>
    api.patch<Room>(`${BASE}/rooms/${id}`, payload),
  deleteRoom: (id: string) => api.delete<null>(`${BASE}/rooms/${id}`),

  // Periods
  listPeriods: () => api.get<TimetablePeriod[]>(`${BASE}/periods`),
  createPeriod: (payload: PeriodPayload) => api.post<TimetablePeriod>(`${BASE}/periods`, payload),
  updatePeriod: (id: string, payload: Partial<PeriodPayload>) =>
    api.patch<TimetablePeriod>(`${BASE}/periods/${id}`, payload),
  deletePeriod: (id: string) => api.delete<null>(`${BASE}/periods/${id}`),

  // Timetables
  list: (params: TimetableQuery) =>
    api.get<PaginatedData<TimetableListItem>>(BASE, { params }),
  get: (id: string) => api.get<Timetable>(`${BASE}/${id}`),
  create: (payload: TimetablePayload) => api.post<Timetable>(BASE, payload),
  update: (
    id: string,
    payload: Partial<Pick<TimetablePayload, 'name' | 'semesterId' | 'effectiveFrom' | 'isActive'>> & {
      effectiveTo?: string | null;
    },
  ) => api.patch<Timetable>(`${BASE}/${id}`, payload),
  remove: (id: string) => api.delete<null>(`${BASE}/${id}`),

  /** Replaces the entire grid; conflicts are rejected as a set. */
  saveSlots: (id: string, slots: SlotPayload[]) =>
    api.put<Timetable>(`${BASE}/${id}/slots`, { slots }),

  /** Dry run so the editor can warn before committing. */
  checkConflicts: (id: string, slots: SlotPayload[]) =>
    api.post<ConflictCheckResult>(`${BASE}/${id}/check-conflicts`, { slots }),

  // Role views
  getMyTeacherTimetable: (academicYearId?: string) =>
    api.get<TeacherTimetableSlot[]>(`${BASE}/me/teacher`, {
      params: academicYearId ? { academicYearId } : {},
    }),
  getStudentTimetable: (studentId: string) =>
    api.get<Timetable | null>(`${BASE}/students/${studentId}`),
};
