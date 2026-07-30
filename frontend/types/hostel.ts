import type { ListQueryParams } from './api';
import type { Gender } from './enums';

export type HostelType = 'BOYS' | 'GIRLS' | 'MIXED';

export type HostelRoomType = 'SINGLE' | 'DOUBLE' | 'TRIPLE' | 'DORMITORY';

export type HostelRoomStatus =
  | 'AVAILABLE'
  | 'PARTIALLY_OCCUPIED'
  | 'FULL'
  | 'MAINTENANCE'
  | 'RESERVED';

export type AllocationStatus = 'ACTIVE' | 'VACATED' | 'TRANSFERRED';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type MessPlanType = 'VEGETARIAN' | 'NON_VEGETARIAN' | 'MIXED';

export type ComplaintCategory =
  | 'MAINTENANCE'
  | 'CLEANLINESS'
  | 'FOOD'
  | 'SECURITY'
  | 'ELECTRICITY'
  | 'PLUMBING'
  | 'INTERNET'
  | 'OTHER';

export type ComplaintStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REJECTED';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export const HOSTEL_TYPE_LABELS: Record<HostelType, string> = {
  BOYS: 'Boys',
  GIRLS: 'Girls',
  MIXED: 'Mixed',
};

export const ROOM_TYPE_LABELS: Record<HostelRoomType, string> = {
  SINGLE: 'Single',
  DOUBLE: 'Double',
  TRIPLE: 'Triple',
  DORMITORY: 'Dormitory',
};

export const ROOM_STATUS_LABELS: Record<HostelRoomStatus, string> = {
  AVAILABLE: 'Available',
  PARTIALLY_OCCUPIED: 'Partly filled',
  FULL: 'Full',
  MAINTENANCE: 'Maintenance',
  RESERVED: 'Reserved',
};

export const MESS_PLAN_TYPE_LABELS: Record<MessPlanType, string> = {
  VEGETARIAN: 'Vegetarian',
  NON_VEGETARIAN: 'Non-vegetarian',
  MIXED: 'Mixed',
};

export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  MAINTENANCE: 'Maintenance',
  CLEANLINESS: 'Cleanliness',
  FOOD: 'Food',
  SECURITY: 'Security',
  ELECTRICITY: 'Electricity',
  PLUMBING: 'Plumbing',
  INTERNET: 'Internet',
  OTHER: 'Other',
};

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

// -------------------------------------------------------------------- Entities

interface StudentBrief {
  id: string;
  admissionNumber: string;
  user: { firstName: string; lastName: string; phone?: string | null };
  class: { name: string } | null;
  section?: { name: string } | null;
}

export interface Hostel {
  id: string;
  name: string;
  code: string;
  type: HostelType;
  address: string | null;
  wardenId: string | null;
  contactPhone: string | null;
  description: string | null;
  warden: {
    id: string;
    employeeId: string;
    user: { firstName: string; lastName: string };
  } | null;
  _count: { rooms: number; complaints: number; messPlans: number };
  /** Aggregated from the hostel's rooms. */
  capacity: number;
  occupied: number;
  occupancyPercent: number | null;
}

export interface HostelDetailRoom {
  id: string;
  roomNumber: string;
  floor: string | null;
  type: HostelRoomType;
  capacity: number;
  occupied: number;
  monthlyRent: string;
  status: HostelRoomStatus;
}

export interface HostelDetail extends Omit<Hostel, 'capacity' | 'occupied' | 'occupancyPercent'> {
  rooms: HostelDetailRoom[];
  messPlans: MessPlan[];
}

export interface HostelRoom {
  id: string;
  hostelId: string;
  roomNumber: string;
  floor: string | null;
  type: HostelRoomType;
  capacity: number;
  occupied: number;
  monthlyRent: string;
  status: HostelRoomStatus;
  hostel: { id: string; name: string; code: string; type: HostelType };
  allocations: {
    id: string;
    bedNumber: string | null;
    student: StudentBrief;
  }[];
}

export interface HostelAllocation {
  id: string;
  roomId: string;
  studentId: string;
  bedNumber: string | null;
  allocatedFrom: string;
  allocatedTo: string | null;
  status: AllocationStatus;
  remarks: string | null;
  room: {
    id: string;
    roomNumber: string;
    floor: string | null;
    type: HostelRoomType;
    capacity: number;
    occupied: number;
    monthlyRent: string;
    hostel: { id: string; name: string; code: string };
  };
  student: StudentBrief & { gender: Gender };
  allocatedBy: { firstName: string; lastName: string } | null;
}

export interface RoomTransfer {
  id: string;
  studentId: string;
  fromRoomId: string;
  toRoomId: string;
  reason: string;
  status: RequestStatus;
  requestedAt: string;
  effectiveDate: string | null;
  reviewComment: string | null;
  student: { id: string; admissionNumber: string; user: { firstName: string; lastName: string } };
  fromRoom: { id: string; roomNumber: string; hostel: { name: string } };
  toRoom: {
    id: string;
    roomNumber: string;
    capacity: number;
    occupied: number;
    hostel: { name: string };
  };
  approvedBy: { firstName: string; lastName: string } | null;
}

export interface HostelVisitor {
  id: string;
  hostelId: string;
  studentId: string;
  visitorName: string;
  relation: string;
  phone: string;
  idProofType: string | null;
  idProofNumber: string | null;
  purpose: string | null;
  checkInAt: string;
  checkOutAt: string | null;
  hostel: { id: string; name: string };
  student: { id: string; admissionNumber: string; user: { firstName: string; lastName: string } };
  approvedBy: { firstName: string; lastName: string } | null;
}

export interface MessPlan {
  id: string;
  hostelId: string;
  name: string;
  type: MessPlanType;
  monthlyCharge: string;
  description: string | null;
  isActive: boolean;
  hostel?: { id: string; name: string };
  _count?: { subscriptions: number };
}

export interface MessSubscription {
  id: string;
  studentId: string;
  messPlanId: string;
  startDate: string;
  endDate: string | null;
  status: AllocationStatus;
  messPlan: MessPlan & { hostel: { name: string } };
  student: { id: string; admissionNumber: string; user: { firstName: string; lastName: string } };
}

export interface HostelComplaint {
  id: string;
  hostelId: string;
  roomId: string | null;
  studentId: string;
  category: ComplaintCategory;
  title: string;
  description: string;
  priority: Priority;
  status: ComplaintStatus;
  assignedToId: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  hostel: { id: string; name: string };
  room: { id: string; roomNumber: string } | null;
  student: { id: string; admissionNumber: string; user: { firstName: string; lastName: string } };
  assignedTo: { id: string; firstName: string; lastName: string } | null;
}

export interface HostelStats {
  roomCount: number;
  capacity: number;
  occupied: number;
  vacant: number;
  occupancyPercent: number | null;
  residents: number;
  openComplaints: number;
  resolvedComplaints: number;
  visitorsInside: number;
  pendingTransfers: number;
}

// -------------------------------------------------------------------- Payloads

export interface HostelPayload {
  name: string;
  code: string;
  type: HostelType;
  address?: string;
  wardenId?: string | null;
  contactPhone?: string;
  description?: string;
}

export interface RoomPayload {
  hostelId: string;
  roomNumber: string;
  floor?: string;
  type: HostelRoomType;
  capacity: number;
  monthlyRent: number;
  status: HostelRoomStatus;
}

export interface BulkRoomsPayload {
  hostelId: string;
  floor?: string;
  type: HostelRoomType;
  capacity: number;
  monthlyRent: number;
  prefix?: string;
  fromNumber: number;
  toNumber: number;
}

export interface AllocateRoomPayload {
  roomId: string;
  studentId: string;
  bedNumber?: string;
  allocatedFrom: string;
  remarks?: string;
}

export interface TransferRequestPayload {
  studentId: string;
  toRoomId: string;
  reason: string;
  effectiveDate?: string;
}

export interface VisitorPayload {
  hostelId: string;
  studentId: string;
  visitorName: string;
  relation: string;
  phone: string;
  idProofType?: string;
  idProofNumber?: string;
  purpose?: string;
  checkInAt: string;
}

export interface MessPlanPayload {
  hostelId: string;
  name: string;
  type: MessPlanType;
  monthlyCharge: number;
  description?: string;
  isActive: boolean;
}

export interface ComplaintPayload {
  hostelId: string;
  roomId?: string | null;
  studentId?: string;
  category: ComplaintCategory;
  title: string;
  description: string;
  priority: Priority;
}

export interface RoomQuery extends ListQueryParams {
  hostelId?: string;
  status?: string;
  type?: HostelRoomType;
  onlyAvailable?: boolean;
}

export interface AllocationQuery extends ListQueryParams {
  hostelId?: string;
  roomId?: string;
  studentId?: string;
  status?: string;
}

export interface VisitorQuery extends ListQueryParams {
  hostelId?: string;
  studentId?: string;
  onlyInside?: boolean;
  from?: string;
  to?: string;
}

export interface ComplaintQuery extends ListQueryParams {
  hostelId?: string;
  studentId?: string;
  category?: ComplaintCategory;
  status?: string;
  priority?: Priority;
}
