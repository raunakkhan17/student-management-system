import type { ListQueryParams } from './api';
import type { AllocationStatus } from './hostel';

export type VehicleType = 'BUS' | 'MINI_BUS' | 'VAN' | 'CAR';

export type VehicleStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE' | 'RETIRED';

export type DriverStatus = 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE' | 'TERMINATED';

export type MaintenanceType =
  | 'ROUTINE_SERVICE'
  | 'REPAIR'
  | 'TYRE_CHANGE'
  | 'INSURANCE_RENEWAL'
  | 'FITNESS_RENEWAL'
  | 'POLLUTION_CHECK'
  | 'OTHER';

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  BUS: 'Bus',
  MINI_BUS: 'Mini bus',
  VAN: 'Van',
  CAR: 'Car',
};

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  ACTIVE: 'Active',
  MAINTENANCE: 'In maintenance',
  INACTIVE: 'Inactive',
  RETIRED: 'Retired',
};

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  ACTIVE: 'Active',
  ON_LEAVE: 'On leave',
  INACTIVE: 'Inactive',
  TERMINATED: 'Terminated',
};

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  ROUTINE_SERVICE: 'Routine service',
  REPAIR: 'Repair',
  TYRE_CHANGE: 'Tyre change',
  INSURANCE_RENEWAL: 'Insurance renewal',
  FITNESS_RENEWAL: 'Fitness renewal',
  POLLUTION_CHECK: 'Pollution check',
  OTHER: 'Other',
};

// -------------------------------------------------------------------- Entities

export interface Vehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string;
  type: VehicleType;
  capacity: number;
  manufactureYear: number | null;
  insuranceExpiry: string | null;
  fitnessExpiry: string | null;
  pollutionExpiry: string | null;
  status: VehicleStatus;
  routes: { id: string; name: string; code: string }[];
  _count: { maintenanceLogs: number };
}

export interface VehicleOption {
  id: string;
  registrationNumber: string;
  make: string;
  model: string;
  capacity: number;
}

export interface Driver {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  alternatePhone: string | null;
  licenseNumber: string;
  licenseExpiry: string;
  address: string | null;
  experienceYears: number;
  status: DriverStatus;
  routes: { id: string; name: string; code: string }[];
}

export interface DriverOption {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export interface RouteStop {
  id: string;
  routeId: string;
  name: string;
  sequence: number;
  pickupTime: string;
  dropTime: string;
  landmark: string | null;
  latitude: string | null;
  longitude: string | null;
}

export interface TransportRoute {
  id: string;
  name: string;
  code: string;
  startPoint: string;
  endPoint: string;
  distanceKm: string | null;
  estimatedMins: number | null;
  fare: string;
  vehicleId: string | null;
  driverId: string | null;
  attendantName: string | null;
  attendantPhone: string | null;
  isActive: boolean;
  vehicle: {
    id: string;
    registrationNumber: string;
    make: string;
    model: string;
    capacity: number;
    status: VehicleStatus;
  } | null;
  driver: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    phone: string;
    status: DriverStatus;
  } | null;
  stops: RouteStop[];
  _count: { allocations: number };
}

export interface TransportAllocation {
  id: string;
  studentId: string;
  routeId: string;
  stopId: string;
  academicYearId: string;
  startDate: string;
  endDate: string | null;
  fare: string;
  status: AllocationStatus;
  student: {
    id: string;
    admissionNumber: string;
    user: { firstName: string; lastName: string; phone: string | null };
    class: { name: string } | null;
    section: { name: string } | null;
  };
  route: {
    id: string;
    name: string;
    code: string;
    fare: string;
    vehicle: { registrationNumber: string; capacity: number } | null;
    driver: { firstName: string; lastName: string; phone: string } | null;
  };
  stop: { id: string; name: string; sequence: number; pickupTime: string; dropTime: string };
  academicYear: { id: string; name: string };
}

export interface MaintenanceLog {
  id: string;
  vehicleId: string;
  type: MaintenanceType;
  description: string;
  serviceDate: string;
  nextServiceDate: string | null;
  cost: string;
  vendor: string | null;
  odometerReading: number | null;
  vehicle: { id: string; registrationNumber: string; make: string; model: string };
  performedBy: { firstName: string; lastName: string } | null;
}

export interface TransportStats {
  vehicleCount: number;
  activeVehicles: number;
  inMaintenance: number;
  activeDrivers: number;
  activeRoutes: number;
  studentsAllocated: number;
  totalCapacity: number;
  seatsRemaining: number;
  utilisationPercent: number | null;
  documentsExpiringSoon: number;
  expiredLicences: number;
  maintenanceSpendThisYear: string;
}

// -------------------------------------------------------------------- Payloads

export interface VehiclePayload {
  registrationNumber: string;
  make: string;
  model: string;
  type: VehicleType;
  capacity: number;
  manufactureYear?: number;
  insuranceExpiry?: string;
  fitnessExpiry?: string;
  pollutionExpiry?: string;
  status: VehicleStatus;
}

export interface DriverPayload {
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  alternatePhone?: string;
  licenseNumber: string;
  licenseExpiry: string;
  address?: string;
  experienceYears: number;
  status: DriverStatus;
}

export interface RoutePayload {
  name: string;
  code: string;
  startPoint: string;
  endPoint: string;
  distanceKm?: number;
  estimatedMins?: number;
  fare: number;
  vehicleId?: string | null;
  driverId?: string | null;
  attendantName?: string;
  attendantPhone?: string;
  isActive: boolean;
}

export interface RouteStopsPayload {
  stops: {
    name: string;
    pickupTime: string;
    dropTime: string;
    landmark?: string;
    latitude?: number;
    longitude?: number;
  }[];
}

export interface AllocateTransportPayload {
  studentId: string;
  routeId: string;
  stopId: string;
  academicYearId: string;
  startDate: string;
  endDate?: string;
  fare?: number;
}

export interface MaintenancePayload {
  vehicleId: string;
  type: MaintenanceType;
  description: string;
  serviceDate: string;
  nextServiceDate?: string;
  cost: number;
  vendor?: string;
  odometerReading?: number;
}

export interface VehicleQuery extends ListQueryParams {
  status?: VehicleStatus;
  type?: VehicleType;
  expiringSoon?: boolean;
}

export interface DriverQuery extends ListQueryParams {
  status?: DriverStatus;
  expiringSoon?: boolean;
}

export interface RouteQuery extends ListQueryParams {
  isActive?: boolean;
  vehicleId?: string;
  driverId?: string;
}

export interface TransportAllocationQuery extends ListQueryParams {
  routeId?: string;
  stopId?: string;
  studentId?: string;
  academicYearId?: string;
  status?: string;
}

export interface MaintenanceQuery extends ListQueryParams {
  vehicleId?: string;
  type?: MaintenanceType;
  from?: string;
  to?: string;
}
