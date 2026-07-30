import { api, httpClient } from '@/lib/api-client';
import type { PaginatedData } from '@/types/api';
import type {
  AllocateTransportPayload,
  Driver,
  DriverOption,
  DriverPayload,
  DriverQuery,
  MaintenanceLog,
  MaintenancePayload,
  MaintenanceQuery,
  RoutePayload,
  RouteQuery,
  RouteStopsPayload,
  TransportAllocation,
  TransportAllocationQuery,
  TransportRoute,
  TransportStats,
  Vehicle,
  VehicleOption,
  VehiclePayload,
  VehicleQuery,
} from '@/types/transport';

const BASE = '/transport';

export const transportService = {
  getStats: () => api.get<TransportStats>(`${BASE}/stats`),

  // Vehicles
  listVehicles: (params: VehicleQuery) =>
    api.get<PaginatedData<Vehicle>>(`${BASE}/vehicles`, { params }),
  listVehicleOptions: () => api.get<VehicleOption[]>(`${BASE}/vehicles/options`),
  createVehicle: (payload: VehiclePayload) => api.post<Vehicle>(`${BASE}/vehicles`, payload),
  updateVehicle: (id: string, payload: Partial<VehiclePayload>) =>
    api.patch<Vehicle>(`${BASE}/vehicles/${id}`, payload),
  deleteVehicle: (id: string) => api.delete<null>(`${BASE}/vehicles/${id}`),

  // Drivers
  listDrivers: (params: DriverQuery) =>
    api.get<PaginatedData<Driver>>(`${BASE}/drivers`, { params }),
  listDriverOptions: () => api.get<DriverOption[]>(`${BASE}/drivers/options`),
  createDriver: (payload: DriverPayload) => api.post<Driver>(`${BASE}/drivers`, payload),
  updateDriver: (id: string, payload: Partial<DriverPayload>) =>
    api.patch<Driver>(`${BASE}/drivers/${id}`, payload),
  deleteDriver: (id: string) => api.delete<null>(`${BASE}/drivers/${id}`),

  // Routes
  listRoutes: (params: RouteQuery) =>
    api.get<PaginatedData<TransportRoute>>(`${BASE}/routes`, { params }),
  getRoute: (id: string) => api.get<TransportRoute>(`${BASE}/routes/${id}`),
  createRoute: (payload: RoutePayload) => api.post<TransportRoute>(`${BASE}/routes`, payload),
  updateRoute: (id: string, payload: Partial<RoutePayload>) =>
    api.patch<TransportRoute>(`${BASE}/routes/${id}`, payload),
  deleteRoute: (id: string) => api.delete<null>(`${BASE}/routes/${id}`),
  setRouteStops: (id: string, payload: RouteStopsPayload) =>
    api.put<TransportRoute>(`${BASE}/routes/${id}/stops`, payload),

  // Allocations
  listAllocations: (params: TransportAllocationQuery) =>
    api.get<PaginatedData<TransportAllocation>>(`${BASE}/allocations`, { params }),
  allocate: (payload: AllocateTransportPayload) =>
    api.post<TransportAllocation>(`${BASE}/allocations`, payload),
  endAllocation: (id: string, endDate: string) =>
    api.post<TransportAllocation>(`${BASE}/allocations/${id}/end`, { endDate }),

  // Maintenance
  listMaintenance: (params: MaintenanceQuery) =>
    api.get<PaginatedData<MaintenanceLog>>(`${BASE}/maintenance`, { params }),
  logMaintenance: (payload: MaintenancePayload) =>
    api.post<MaintenanceLog>(`${BASE}/maintenance`, payload),

  /** Streams a file, so it bypasses the JSON envelope unwrapping. */
  exportRiders: async (params: { routeId?: string; format: 'csv' | 'xlsx' }) => {
    const response = await httpClient.get<Blob>(`${BASE}/reports/riders`, {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
};
