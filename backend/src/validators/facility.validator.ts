import {
  ComplaintCategory,
  ComplaintStatus,
  DriverStatus,
  HostelRoomStatus,
  HostelRoomType,
  HostelType,
  MaintenanceType,
  MessPlanType,
  Priority,
  RequestStatus,
  VehicleStatus,
  VehicleType,
} from '@prisma/client';
import { z } from 'zod';
import {
  csvToArray,
  dateOnlySchema,
  optionalString,
  paginationQuerySchema,
  phoneSchema,
  requiredString,
  timeSchema,
} from './common.validator';

const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(20)
  .regex(/^[A-Z0-9-]+$/, 'Use letters, numbers and dashes only');

// ============================================================
// MODULE 12 — HOSTEL
// ============================================================

export const createHostelSchema = z.object({
  name: requiredString('Name', 160),
  code: codeSchema,
  type: z.nativeEnum(HostelType),
  address: optionalString(300),
  wardenId: z.string().uuid().nullish(),
  contactPhone: phoneSchema.optional(),
  description: optionalString(500),
});

export const updateHostelSchema = createHostelSchema.partial();

export const createHostelRoomSchema = z.object({
  hostelId: z.string().uuid('Select a hostel'),
  roomNumber: requiredString('Room number', 20),
  floor: optionalString(20),
  type: z.nativeEnum(HostelRoomType).default('DOUBLE'),
  capacity: z.coerce.number().int().min(1).max(40).default(2),
  monthlyRent: z.coerce.number().nonnegative().max(999_999).default(0),
  status: z.nativeEnum(HostelRoomStatus).default('AVAILABLE'),
});

export const updateHostelRoomSchema = createHostelRoomSchema.partial().omit({ hostelId: true });

/** Bulk room creation, e.g. 101–120 on one floor. */
export const bulkRoomsSchema = z
  .object({
    hostelId: z.string().uuid('Select a hostel'),
    floor: optionalString(20),
    type: z.nativeEnum(HostelRoomType).default('DOUBLE'),
    capacity: z.coerce.number().int().min(1).max(40).default(2),
    monthlyRent: z.coerce.number().nonnegative().max(999_999).default(0),
    prefix: optionalString(10),
    fromNumber: z.coerce.number().int().min(1).max(9999),
    toNumber: z.coerce.number().int().min(1).max(9999),
  })
  .refine((data) => data.toNumber >= data.fromNumber, {
    message: 'The last room number must not be below the first',
    path: ['toNumber'],
  })
  .refine((data) => data.toNumber - data.fromNumber < 200, {
    message: 'Create at most 200 rooms at a time',
    path: ['toNumber'],
  });

export const roomQuerySchema = paginationQuerySchema.extend({
  hostelId: z.string().uuid().optional(),
  status: csvToArray(z.nativeEnum(HostelRoomStatus)),
  type: z.nativeEnum(HostelRoomType).optional(),
  /** Only rooms with a free bed. */
  onlyAvailable: z.coerce.boolean().default(false),
});

export const allocateRoomSchema = z.object({
  roomId: z.string().uuid('Select a room'),
  studentId: z.string().uuid('Select a student'),
  bedNumber: optionalString(10),
  allocatedFrom: dateOnlySchema,
  remarks: optionalString(300),
});

export const vacateRoomSchema = z.object({
  allocatedTo: dateOnlySchema,
  remarks: optionalString(300),
});

export const allocationQuerySchema = paginationQuerySchema.extend({
  hostelId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  status: csvToArray(z.enum(['ACTIVE', 'VACATED', 'TRANSFERRED'])),
});

export const roomTransferSchema = z.object({
  studentId: z.string().uuid('Select a student'),
  toRoomId: z.string().uuid('Select the target room'),
  reason: requiredString('Reason', 500),
  effectiveDate: dateOnlySchema.optional(),
});

export const reviewTransferSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewComment: optionalString(500),
  effectiveDate: dateOnlySchema.optional(),
});

export const transferQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(RequestStatus).optional(),
});

export const createVisitorSchema = z
  .object({
    hostelId: z.string().uuid('Select a hostel'),
    studentId: z.string().uuid('Select a student'),
    visitorName: requiredString('Visitor name', 160),
    relation: requiredString('Relationship', 60),
    phone: phoneSchema,
    idProofType: optionalString(60),
    idProofNumber: optionalString(60),
    purpose: optionalString(300),
    checkInAt: z.coerce.date().default(() => new Date()),
  })
  .refine((data) => data.checkInAt.getTime() <= Date.now() + 60_000, {
    message: 'Check-in cannot be in the future',
    path: ['checkInAt'],
  });

export const checkOutVisitorSchema = z.object({
  checkOutAt: z.coerce.date().default(() => new Date()),
});

export const visitorQuerySchema = paginationQuerySchema.extend({
  hostelId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  /** Visitors still on the premises. */
  onlyInside: z.coerce.boolean().default(false),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});

export const createMessPlanSchema = z.object({
  hostelId: z.string().uuid('Select a hostel'),
  name: requiredString('Name', 120),
  type: z.nativeEnum(MessPlanType).default('VEGETARIAN'),
  monthlyCharge: z.coerce.number().nonnegative().max(999_999),
  description: optionalString(300),
  isActive: z.boolean().default(true),
});

export const subscribeMessSchema = z.object({
  studentId: z.string().uuid('Select a student'),
  messPlanId: z.string().uuid('Select a mess plan'),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema.optional(),
});

export const messPlanQuerySchema = z.object({
  hostelId: z.string().uuid().optional(),
});

export const createComplaintSchema = z.object({
  hostelId: z.string().uuid('Select a hostel'),
  roomId: z.string().uuid().nullish(),
  studentId: z.string().uuid().optional(),
  category: z.nativeEnum(ComplaintCategory),
  title: requiredString('Title', 200),
  description: requiredString('Description', 2000),
  priority: z.nativeEnum(Priority).default('MEDIUM'),
});

export const updateComplaintSchema = z.object({
  status: z.nativeEnum(ComplaintStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  assignedToId: z.string().uuid().nullish(),
  resolution: optionalString(2000),
});

export const complaintQuerySchema = paginationQuerySchema.extend({
  hostelId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  category: z.nativeEnum(ComplaintCategory).optional(),
  status: csvToArray(z.nativeEnum(ComplaintStatus)),
  priority: z.nativeEnum(Priority).optional(),
});

// ============================================================
// MODULE 13 — TRANSPORT
// ============================================================

export const createVehicleSchema = z.object({
  registrationNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(4)
    .max(20)
    .regex(/^[A-Z0-9- ]+$/, 'Enter a valid registration number'),
  make: requiredString('Make', 80),
  model: requiredString('Model', 80),
  type: z.nativeEnum(VehicleType).default('BUS'),
  capacity: z.coerce.number().int().min(1).max(120),
  manufactureYear: z.coerce.number().int().min(1950).max(2200).optional(),
  insuranceExpiry: dateOnlySchema.optional(),
  fitnessExpiry: dateOnlySchema.optional(),
  pollutionExpiry: dateOnlySchema.optional(),
  status: z.nativeEnum(VehicleStatus).default('ACTIVE'),
});

export const updateVehicleSchema = createVehicleSchema.partial();

export const vehicleQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(VehicleStatus).optional(),
  type: z.nativeEnum(VehicleType).optional(),
  /** Vehicles with a document expiring within 30 days. */
  expiringSoon: z.coerce.boolean().default(false),
});

export const createDriverSchema = z.object({
  employeeCode: codeSchema,
  firstName: requiredString('First name', 80),
  lastName: requiredString('Last name', 80),
  phone: phoneSchema,
  alternatePhone: phoneSchema.optional(),
  licenseNumber: requiredString('License number', 40),
  licenseExpiry: dateOnlySchema,
  address: optionalString(300),
  experienceYears: z.coerce.number().int().min(0).max(60).default(0),
  status: z.nativeEnum(DriverStatus).default('ACTIVE'),
});

export const updateDriverSchema = createDriverSchema.partial();

export const driverQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(DriverStatus).optional(),
  /** Drivers whose licence expires within 30 days. */
  expiringSoon: z.coerce.boolean().default(false),
});

export const createRouteSchema = z.object({
  name: requiredString('Name', 160),
  code: codeSchema,
  startPoint: requiredString('Start point', 160),
  endPoint: requiredString('End point', 160),
  distanceKm: z.coerce.number().nonnegative().max(9999).optional(),
  estimatedMins: z.coerce.number().int().min(1).max(1440).optional(),
  fare: z.coerce.number().nonnegative().max(999_999).default(0),
  vehicleId: z.string().uuid().nullish(),
  driverId: z.string().uuid().nullish(),
  attendantName: optionalString(160),
  attendantPhone: phoneSchema.optional(),
  isActive: z.boolean().default(true),
});

export const updateRouteSchema = createRouteSchema.partial();

export const routeQuerySchema = paginationQuerySchema.extend({
  isActive: z.coerce.boolean().optional(),
  vehicleId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
});

/** Stops are replaced as an ordered set so the sequence stays gap-free. */
export const setRouteStopsSchema = z
  .object({
    stops: z
      .array(
        z.object({
          name: requiredString('Stop name', 160),
          pickupTime: timeSchema,
          dropTime: timeSchema,
          landmark: optionalString(160),
          latitude: z.coerce.number().min(-90).max(90).optional(),
          longitude: z.coerce.number().min(-180).max(180).optional(),
        }),
      )
      .min(1, 'Add at least one stop')
      .max(60),
  })
  .refine(
    (data) => {
      const names = data.stops.map((stop) => stop.name.toLowerCase());
      return new Set(names).size === names.length;
    },
    { message: 'Two stops share the same name', path: ['stops'] },
  );

export const allocateTransportSchema = z.object({
  studentId: z.string().uuid('Select a student'),
  routeId: z.string().uuid('Select a route'),
  stopId: z.string().uuid('Select a stop'),
  academicYearId: z.string().uuid('Select an academic year'),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema.optional(),
  /** Defaults to the route fare when omitted. */
  fare: z.coerce.number().nonnegative().max(999_999).optional(),
});

export const endTransportSchema = z.object({
  endDate: dateOnlySchema,
});

export const transportAllocationQuerySchema = paginationQuerySchema.extend({
  routeId: z.string().uuid().optional(),
  stopId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  status: csvToArray(z.enum(['ACTIVE', 'VACATED', 'TRANSFERRED'])),
});

export const createMaintenanceSchema = z.object({
  vehicleId: z.string().uuid('Select a vehicle'),
  type: z.nativeEnum(MaintenanceType),
  description: requiredString('Description', 1000),
  serviceDate: dateOnlySchema,
  nextServiceDate: dateOnlySchema.optional(),
  cost: z.coerce.number().nonnegative().max(9_999_999).default(0),
  vendor: optionalString(160),
  odometerReading: z.coerce.number().int().min(0).max(9_999_999).optional(),
});

export const maintenanceQuerySchema = paginationQuerySchema.extend({
  vehicleId: z.string().uuid().optional(),
  type: z.nativeEnum(MaintenanceType).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});

export const requestStatusSchema = z.object({
  status: z.nativeEnum(RequestStatus),
  reviewComment: optionalString(500),
});

export type CreateHostelInput = z.infer<typeof createHostelSchema>;
export type BulkRoomsInput = z.infer<typeof bulkRoomsSchema>;
export type AllocateRoomInput = z.infer<typeof allocateRoomSchema>;
export type RoomTransferInput = z.infer<typeof roomTransferSchema>;
export type CreateVisitorInput = z.infer<typeof createVisitorSchema>;
export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;
export type CreateRouteInput = z.infer<typeof createRouteSchema>;
export type SetRouteStopsInput = z.infer<typeof setRouteStopsSchema>;
export type AllocateTransportInput = z.infer<typeof allocateTransportSchema>;
export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
