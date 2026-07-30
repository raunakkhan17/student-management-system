import { api, httpClient } from '@/lib/api-client';
import type { ListQueryParams, PaginatedData } from '@/types/api';
import type {
  AllocateRoomPayload,
  AllocationQuery,
  BulkRoomsPayload,
  ComplaintPayload,
  ComplaintQuery,
  ComplaintStatus,
  Hostel,
  HostelAllocation,
  HostelComplaint,
  HostelDetail,
  HostelPayload,
  HostelRoom,
  HostelStats,
  HostelVisitor,
  MessPlan,
  MessPlanPayload,
  MessSubscription,
  Priority,
  RequestStatus,
  RoomPayload,
  RoomQuery,
  RoomTransfer,
  TransferRequestPayload,
  VisitorPayload,
  VisitorQuery,
} from '@/types/hostel';

const BASE = '/hostel';

export const hostelService = {
  getStats: () => api.get<HostelStats>(`${BASE}/stats`),

  // Hostels
  list: (params: ListQueryParams) => api.get<PaginatedData<Hostel>>(BASE, { params }),
  get: (id: string) => api.get<HostelDetail>(`${BASE}/${id}`),
  create: (payload: HostelPayload) => api.post<Hostel>(BASE, payload),
  update: (id: string, payload: Partial<HostelPayload>) =>
    api.patch<Hostel>(`${BASE}/${id}`, payload),
  remove: (id: string) => api.delete<null>(`${BASE}/${id}`),

  // Rooms
  listRooms: (params: RoomQuery) => api.get<PaginatedData<HostelRoom>>(`${BASE}/rooms`, { params }),
  createRoom: (payload: RoomPayload) => api.post<HostelRoom>(`${BASE}/rooms`, payload),
  createRoomsInBulk: (payload: BulkRoomsPayload) =>
    api.post<{ created: number; skipped: string[] }>(`${BASE}/rooms/bulk`, payload),
  updateRoom: (roomId: string, payload: Partial<Omit<RoomPayload, 'hostelId'>>) =>
    api.patch<HostelRoom>(`${BASE}/rooms/${roomId}`, payload),
  deleteRoom: (roomId: string) => api.delete<null>(`${BASE}/rooms/${roomId}`),

  // Allocations
  listAllocations: (params: AllocationQuery) =>
    api.get<PaginatedData<HostelAllocation>>(`${BASE}/allocations`, { params }),
  allocateRoom: (payload: AllocateRoomPayload) =>
    api.post<HostelAllocation>(`${BASE}/allocations`, payload),
  vacateRoom: (id: string, payload: { allocatedTo: string; remarks?: string }) =>
    api.post<HostelAllocation>(`${BASE}/allocations/${id}/vacate`, payload),

  // Room transfers
  listTransfers: (params: ListQueryParams & { status?: RequestStatus }) =>
    api.get<PaginatedData<RoomTransfer>>(`${BASE}/transfers`, { params }),
  requestTransfer: (payload: TransferRequestPayload) =>
    api.post<RoomTransfer>(`${BASE}/transfers`, payload),
  reviewTransfer: (
    id: string,
    payload: { status: 'APPROVED' | 'REJECTED'; reviewComment?: string; effectiveDate?: string },
  ) => api.post<RoomTransfer>(`${BASE}/transfers/${id}/review`, payload),

  // Visitors
  listVisitors: (params: VisitorQuery) =>
    api.get<PaginatedData<HostelVisitor>>(`${BASE}/visitors`, { params }),
  logVisitor: (payload: VisitorPayload) => api.post<HostelVisitor>(`${BASE}/visitors`, payload),
  checkOutVisitor: (id: string, checkOutAt: string) =>
    api.post<HostelVisitor>(`${BASE}/visitors/${id}/check-out`, { checkOutAt }),

  // Mess
  listMessPlans: (hostelId?: string) =>
    api.get<MessPlan[]>(`${BASE}/mess-plans`, { params: hostelId ? { hostelId } : {} }),
  createMessPlan: (payload: MessPlanPayload) => api.post<MessPlan>(`${BASE}/mess-plans`, payload),
  subscribeMess: (payload: {
    studentId: string;
    messPlanId: string;
    startDate: string;
    endDate?: string;
  }) => api.post<MessSubscription>(`${BASE}/mess-subscriptions`, payload),

  // Complaints
  listComplaints: (params: ComplaintQuery) =>
    api.get<PaginatedData<HostelComplaint>>(`${BASE}/complaints`, { params }),
  createComplaint: (payload: ComplaintPayload) =>
    api.post<HostelComplaint>(`${BASE}/complaints`, payload),
  updateComplaint: (
    id: string,
    payload: {
      status?: ComplaintStatus;
      priority?: Priority;
      assignedToId?: string | null;
      resolution?: string;
    },
  ) => api.patch<HostelComplaint>(`${BASE}/complaints/${id}`, payload),

  /** Streams a file, so it bypasses the JSON envelope unwrapping. */
  exportOccupancy: async (params: { hostelId?: string; format: 'csv' | 'xlsx' }) => {
    const response = await httpClient.get<Blob>(`${BASE}/reports/occupancy`, {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
};
