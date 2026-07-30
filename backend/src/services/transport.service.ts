import { Prisma, type AllocationStatus, type DriverStatus, type VehicleStatus } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { BadRequestError, ConflictError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';
import type {
  AllocateTransportInput,
  CreateMaintenanceInput,
  CreateRouteInput,
  SetRouteStopsInput,
} from '@/validators/facility.validator';

/** Documents expiring within this window are surfaced as warnings. */
const EXPIRY_WARNING_DAYS = 30;

// ------------------------------------------------------------------- Vehicles

const vehicleInclude = {
  routes: { where: { deletedAt: null }, select: { id: true, name: true, code: true } },
  _count: { select: { maintenanceLogs: true } },
} satisfies Prisma.VehicleInclude;

export type VehicleRecord = Prisma.VehicleGetPayload<{ include: typeof vehicleInclude }>;

export async function listVehicles(
  query: ListQueryOptions,
  filters: { status?: VehicleStatus; type?: Prisma.VehicleWhereInput['type']; expiringSoon?: boolean },
): Promise<PaginatedData<VehicleRecord>> {
  const warningCutoff = new Date(Date.now() + EXPIRY_WARNING_DAYS * 86_400_000);

  const where: Prisma.VehicleWhereInput = {
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    // Any one of the three statutory documents lapsing counts.
    ...(filters.expiringSoon
      ? {
          OR: [
            { insuranceExpiry: { lte: warningCutoff } },
            { fitnessExpiry: { lte: warningCutoff } },
            { pollutionExpiry: { lte: warningCutoff } },
          ],
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { registrationNumber: { contains: query.search, mode: 'insensitive' } },
            { make: { contains: query.search, mode: 'insensitive' } },
            { model: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      include: vehicleInclude,
      orderBy: { registrationNumber: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.vehicle.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function createVehicle(data: Prisma.VehicleUncheckedCreateInput) {
  return prisma.vehicle.create({ data, include: vehicleInclude });
}

export async function updateVehicle(id: string, data: Prisma.VehicleUncheckedUpdateInput) {
  const existing = await prisma.vehicle.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, capacity: true },
  });

  if (!existing) throw new NotFoundError('Vehicle');

  // Shrinking capacity below the students already riding would oversubscribe it.
  if (typeof data.capacity === 'number' && data.capacity < existing.capacity) {
    const riders = await prisma.studentTransport.count({
      where: { status: 'ACTIVE', route: { vehicleId: id } },
    });

    if (data.capacity < riders) {
      throw new ConflictError('Capacity cannot be below the number of students allocated.', [
        { field: 'capacity', message: `${riders} student(s) currently allocated` },
      ]);
    }
  }

  return prisma.vehicle.update({ where: { id }, data, include: vehicleInclude });
}

export async function deleteVehicle(id: string): Promise<void> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, deletedAt: null },
    include: { routes: { where: { deletedAt: null }, select: { id: true } } },
  });

  if (!vehicle) throw new NotFoundError('Vehicle');

  if (vehicle.routes.length > 0) {
    throw new ConflictError('This vehicle is assigned to a route.', [
      { field: 'id', message: `Assigned to ${vehicle.routes.length} route(s)` },
    ]);
  }

  await prisma.vehicle.update({ where: { id }, data: { deletedAt: new Date(), status: 'RETIRED' } });
}

export async function listVehicleOptions() {
  return prisma.vehicle.findMany({
    where: { deletedAt: null, status: 'ACTIVE' },
    select: { id: true, registrationNumber: true, make: true, model: true, capacity: true },
    orderBy: { registrationNumber: 'asc' },
  });
}

// -------------------------------------------------------------------- Drivers

const driverInclude = {
  routes: { where: { deletedAt: null }, select: { id: true, name: true, code: true } },
} satisfies Prisma.DriverInclude;

export async function listDrivers(
  query: ListQueryOptions,
  filters: { status?: DriverStatus; expiringSoon?: boolean },
) {
  const warningCutoff = new Date(Date.now() + EXPIRY_WARNING_DAYS * 86_400_000);

  const where: Prisma.DriverWhereInput = {
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.expiringSoon ? { licenseExpiry: { lte: warningCutoff } } : {}),
    ...(query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
            { employeeCode: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
            { licenseNumber: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.driver.findMany({
      where,
      include: driverInclude,
      orderBy: { firstName: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.driver.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function createDriver(data: Prisma.DriverUncheckedCreateInput) {
  // A driver with a lapsed licence must not be entered as active.
  if (data.licenseExpiry && new Date(data.licenseExpiry as Date) < new Date()) {
    throw new BadRequestError('The licence expiry date is in the past', [
      { field: 'licenseExpiry', message: 'Enter a valid, unexpired licence' },
    ]);
  }

  return prisma.driver.create({ data, include: driverInclude });
}

export async function updateDriver(id: string, data: Prisma.DriverUncheckedUpdateInput) {
  const existing = await prisma.driver.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Driver');
  return prisma.driver.update({ where: { id }, data, include: driverInclude });
}

export async function deleteDriver(id: string): Promise<void> {
  const driver = await prisma.driver.findFirst({
    where: { id, deletedAt: null },
    include: { routes: { where: { deletedAt: null }, select: { id: true } } },
  });

  if (!driver) throw new NotFoundError('Driver');

  if (driver.routes.length > 0) {
    throw new ConflictError('This driver is assigned to a route.', [
      { field: 'id', message: `Assigned to ${driver.routes.length} route(s)` },
    ]);
  }

  await prisma.driver.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'TERMINATED' },
  });
}

export async function listDriverOptions() {
  return prisma.driver.findMany({
    where: { deletedAt: null, status: 'ACTIVE' },
    select: { id: true, employeeCode: true, firstName: true, lastName: true, phone: true },
    orderBy: { firstName: 'asc' },
  });
}

// --------------------------------------------------------------------- Routes

const routeInclude = {
  vehicle: {
    select: { id: true, registrationNumber: true, make: true, model: true, capacity: true, status: true },
  },
  driver: {
    select: { id: true, employeeCode: true, firstName: true, lastName: true, phone: true, status: true },
  },
  stops: { orderBy: { sequence: 'asc' } },
  _count: { select: { allocations: true } },
} satisfies Prisma.TransportRouteInclude;

export type RouteRecord = Prisma.TransportRouteGetPayload<{ include: typeof routeInclude }>;

export async function listRoutes(
  query: ListQueryOptions,
  filters: { isActive?: boolean; vehicleId?: string; driverId?: string },
): Promise<PaginatedData<RouteRecord>> {
  const where: Prisma.TransportRouteWhereInput = {
    deletedAt: null,
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
    ...(filters.driverId ? { driverId: filters.driverId } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
            { startPoint: { contains: query.search, mode: 'insensitive' } },
            { endPoint: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.transportRoute.findMany({
      where,
      include: routeInclude,
      orderBy: { name: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.transportRoute.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getRoute(id: string): Promise<RouteRecord> {
  const route = await prisma.transportRoute.findFirst({
    where: { id, deletedAt: null },
    include: routeInclude,
  });

  if (!route) throw new NotFoundError('Route');
  return route;
}

/** A vehicle or driver can only serve one active route at a time. */
async function assertResourcesAreFree(
  vehicleId: string | null,
  driverId: string | null,
  excludeRouteId: string | null,
): Promise<void> {
  if (vehicleId) {
    const clash = await prisma.transportRoute.findFirst({
      where: {
        vehicleId,
        isActive: true,
        deletedAt: null,
        ...(excludeRouteId ? { id: { not: excludeRouteId } } : {}),
      },
      select: { name: true },
    });

    if (clash) {
      throw new ConflictError(`That vehicle already serves the route "${clash.name}"`, [
        { field: 'vehicleId', message: 'Vehicle already assigned' },
      ]);
    }
  }

  if (driverId) {
    const clash = await prisma.transportRoute.findFirst({
      where: {
        driverId,
        isActive: true,
        deletedAt: null,
        ...(excludeRouteId ? { id: { not: excludeRouteId } } : {}),
      },
      select: { name: true },
    });

    if (clash) {
      throw new ConflictError(`That driver already serves the route "${clash.name}"`, [
        { field: 'driverId', message: 'Driver already assigned' },
      ]);
    }
  }
}

export async function createRoute(input: CreateRouteInput): Promise<RouteRecord> {
  if (input.isActive) {
    await assertResourcesAreFree(input.vehicleId ?? null, input.driverId ?? null, null);
  }

  const created = await prisma.transportRoute.create({
    data: {
      name: input.name,
      code: input.code,
      startPoint: input.startPoint,
      endPoint: input.endPoint,
      distanceKm: input.distanceKm ?? null,
      estimatedMins: input.estimatedMins ?? null,
      fare: input.fare,
      vehicleId: input.vehicleId ?? null,
      driverId: input.driverId ?? null,
      attendantName: input.attendantName ?? null,
      attendantPhone: input.attendantPhone ?? null,
      isActive: input.isActive,
    },
  });

  return getRoute(created.id);
}

export async function updateRoute(
  id: string,
  input: Partial<CreateRouteInput>,
): Promise<RouteRecord> {
  const existing = await getRoute(id);

  const nextVehicleId = input.vehicleId !== undefined ? input.vehicleId : existing.vehicleId;
  const nextDriverId = input.driverId !== undefined ? input.driverId : existing.driverId;
  const willBeActive = input.isActive !== undefined ? input.isActive : existing.isActive;

  if (willBeActive) {
    await assertResourcesAreFree(nextVehicleId ?? null, nextDriverId ?? null, id);
  }

  await prisma.transportRoute.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.startPoint !== undefined ? { startPoint: input.startPoint } : {}),
      ...(input.endPoint !== undefined ? { endPoint: input.endPoint } : {}),
      ...(input.distanceKm !== undefined ? { distanceKm: input.distanceKm } : {}),
      ...(input.estimatedMins !== undefined ? { estimatedMins: input.estimatedMins } : {}),
      ...(input.fare !== undefined ? { fare: input.fare } : {}),
      ...(input.vehicleId !== undefined ? { vehicleId: input.vehicleId } : {}),
      ...(input.driverId !== undefined ? { driverId: input.driverId } : {}),
      ...(input.attendantName !== undefined ? { attendantName: input.attendantName } : {}),
      ...(input.attendantPhone !== undefined ? { attendantPhone: input.attendantPhone } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  return getRoute(id);
}

export async function deleteRoute(id: string): Promise<void> {
  const route = await prisma.transportRoute.findFirst({
    where: { id, deletedAt: null },
    include: {
      _count: { select: { allocations: { where: { status: 'ACTIVE' } } } },
    },
  });

  if (!route) throw new NotFoundError('Route');

  if (route._count.allocations > 0) {
    throw new ConflictError('Students are still allocated to this route.', [
      { field: 'id', message: `${route._count.allocations} student(s) allocated` },
    ]);
  }

  await prisma.transportRoute.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

/**
 * Replaces a route's stops.
 *
 * The sequence is re-derived from array order, so it is always gap-free — the
 * `(routeId, sequence)` unique index depends on that.
 */
export async function setRouteStops(
  routeId: string,
  input: SetRouteStopsInput,
): Promise<RouteRecord> {
  await getRoute(routeId);

  // A stop still referenced by an allocation cannot simply be deleted.
  const referenced = await prisma.studentTransport.findMany({
    where: { routeId, status: 'ACTIVE' },
    select: { stopId: true, stop: { select: { name: true } } },
    distinct: ['stopId'],
  });

  const incomingNames = new Set(input.stops.map((stop) => stop.name.toLowerCase()));
  const orphaned = referenced.filter(
    (allocation) => !incomingNames.has(allocation.stop.name.toLowerCase()),
  );

  if (orphaned.length > 0) {
    throw new ConflictError(
      'Students are allocated to stops that would be removed. Reassign them first.',
      orphaned.map((allocation) => ({
        field: 'stops',
        message: `"${allocation.stop.name}" still has students allocated`,
      })),
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.routeStop.deleteMany({ where: { routeId } });

    await tx.routeStop.createMany({
      data: input.stops.map((stop, index) => ({
        routeId,
        name: stop.name,
        sequence: index + 1,
        pickupTime: stop.pickupTime,
        dropTime: stop.dropTime,
        landmark: stop.landmark ?? null,
        latitude: stop.latitude ?? null,
        longitude: stop.longitude ?? null,
      })),
    });
  });

  return getRoute(routeId);
}

// ---------------------------------------------------------------- Allocations

const transportAllocationInclude = {
  student: {
    select: {
      id: true,
      admissionNumber: true,
      user: { select: { firstName: true, lastName: true, phone: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  },
  route: {
    select: {
      id: true,
      name: true,
      code: true,
      fare: true,
      vehicle: { select: { registrationNumber: true, capacity: true } },
      driver: { select: { firstName: true, lastName: true, phone: true } },
    },
  },
  stop: { select: { id: true, name: true, sequence: true, pickupTime: true, dropTime: true } },
  academicYear: { select: { id: true, name: true } },
} satisfies Prisma.StudentTransportInclude;

export type TransportAllocationRecord = Prisma.StudentTransportGetPayload<{
  include: typeof transportAllocationInclude;
}>;

/**
 * Allocates a student to a route and stop.
 *
 * Vehicle capacity is enforced inside the transaction so concurrent allocations
 * cannot oversubscribe a bus.
 */
export async function allocateTransport(
  input: AllocateTransportInput,
): Promise<TransportAllocationRecord> {
  return prisma.$transaction(async (tx) => {
    const [student, route, stop] = await Promise.all([
      tx.student.findFirst({
        where: { id: input.studentId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true },
      }),
      tx.transportRoute.findFirst({
        where: { id: input.routeId, deletedAt: null, isActive: true },
        select: {
          id: true,
          name: true,
          fare: true,
          vehicle: { select: { capacity: true, registrationNumber: true } },
        },
      }),
      tx.routeStop.findFirst({
        where: { id: input.stopId, routeId: input.routeId },
        select: { id: true },
      }),
    ]);

    if (!student) throw new NotFoundError('Student');
    if (!route) throw new NotFoundError('Route');
    if (!stop) {
      throw new BadRequestError('That stop does not belong to the selected route', [
        { field: 'stopId', message: 'Stop and route do not match' },
      ]);
    }

    const existing = await tx.studentTransport.findFirst({
      where: {
        studentId: input.studentId,
        academicYearId: input.academicYearId,
        status: 'ACTIVE',
      },
      select: { id: true, route: { select: { name: true } } },
    });

    if (existing) {
      throw new ConflictError(
        `This student already uses the route "${existing.route.name}" for that year.`,
        [{ field: 'studentId', message: 'Already allocated' }],
      );
    }

    if (route.vehicle) {
      const riders = await tx.studentTransport.count({
        where: { routeId: input.routeId, status: 'ACTIVE' },
      });

      if (riders >= route.vehicle.capacity) {
        throw new ConflictError(
          `${route.vehicle.registrationNumber} is at capacity (${route.vehicle.capacity} seats).`,
          [{ field: 'routeId', message: 'No seats remaining' }],
        );
      }
    }

    const allocation = await tx.studentTransport.create({
      data: {
        studentId: input.studentId,
        routeId: input.routeId,
        stopId: input.stopId,
        academicYearId: input.academicYearId,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        // Falls back to the route's standard fare.
        fare: input.fare ?? route.fare,
        status: 'ACTIVE',
      },
    });

    return tx.studentTransport.findUniqueOrThrow({
      where: { id: allocation.id },
      include: transportAllocationInclude,
    });
  });
}

export async function endTransportAllocation(
  id: string,
  endDate: Date,
): Promise<TransportAllocationRecord> {
  const allocation = await prisma.studentTransport.findUnique({
    where: { id },
    select: { status: true, startDate: true },
  });

  if (!allocation) throw new NotFoundError('Transport allocation');

  if (allocation.status !== 'ACTIVE') {
    throw new ConflictError(`This allocation is already ${allocation.status.toLowerCase()}`);
  }

  if (endDate < allocation.startDate) {
    throw new BadRequestError('The end date cannot be before the start date', [
      { field: 'endDate', message: 'Choose a later date' },
    ]);
  }

  return prisma.studentTransport.update({
    where: { id },
    data: { status: 'VACATED', endDate },
    include: transportAllocationInclude,
  });
}

export async function listTransportAllocations(
  query: ListQueryOptions,
  filters: {
    routeId?: string;
    stopId?: string;
    studentId?: string;
    academicYearId?: string;
    status?: AllocationStatus[];
  },
): Promise<PaginatedData<TransportAllocationRecord>> {
  const where: Prisma.StudentTransportWhereInput = {
    ...(filters.routeId ? { routeId: filters.routeId } : {}),
    ...(filters.stopId ? { stopId: filters.stopId } : {}),
    ...(filters.studentId ? { studentId: filters.studentId } : {}),
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.status?.length ? { status: { in: filters.status } } : { status: 'ACTIVE' }),
    ...(query.search
      ? {
          OR: [
            { student: { admissionNumber: { contains: query.search, mode: 'insensitive' } } },
            { student: { user: { firstName: { contains: query.search, mode: 'insensitive' } } } },
            { student: { user: { lastName: { contains: query.search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.studentTransport.findMany({
      where,
      include: transportAllocationInclude,
      orderBy: [{ route: { name: 'asc' } }, { stop: { sequence: 'asc' } }],
      skip: query.skip,
      take: query.take,
    }),
    prisma.studentTransport.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

// ---------------------------------------------------------------- Maintenance

const maintenanceInclude = {
  vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
  performedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.VehicleMaintenanceInclude;

export async function logMaintenance(input: CreateMaintenanceInput, performedById: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, deletedAt: null },
    select: { id: true },
  });

  if (!vehicle) throw new NotFoundError('Vehicle');

  return prisma.$transaction(async (tx) => {
    const record = await tx.vehicleMaintenance.create({
      data: {
        vehicleId: input.vehicleId,
        type: input.type,
        description: input.description,
        serviceDate: input.serviceDate,
        nextServiceDate: input.nextServiceDate ?? null,
        cost: input.cost,
        vendor: input.vendor ?? null,
        odometerReading: input.odometerReading ?? null,
        performedById,
      },
    });

    // Renewal entries also refresh the corresponding expiry date on the vehicle.
    const expiryField =
      input.type === 'INSURANCE_RENEWAL'
        ? 'insuranceExpiry'
        : input.type === 'FITNESS_RENEWAL'
          ? 'fitnessExpiry'
          : input.type === 'POLLUTION_CHECK'
            ? 'pollutionExpiry'
            : null;

    if (expiryField && input.nextServiceDate) {
      await tx.vehicle.update({
        where: { id: input.vehicleId },
        data: { [expiryField]: input.nextServiceDate },
      });
    }

    return tx.vehicleMaintenance.findUniqueOrThrow({
      where: { id: record.id },
      include: maintenanceInclude,
    });
  });
}

export async function listMaintenance(
  query: ListQueryOptions,
  filters: {
    vehicleId?: string;
    type?: Prisma.VehicleMaintenanceWhereInput['type'];
    from?: Date;
    to?: Date;
  },
) {
  const where: Prisma.VehicleMaintenanceWhereInput = {
    ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.from || filters.to
      ? {
          serviceDate: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.vehicleMaintenance.findMany({
      where,
      include: maintenanceInclude,
      orderBy: { serviceDate: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.vehicleMaintenance.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

/** Fleet and allocation counters, plus compliance warnings. */
export async function getTransportStats() {
  const warningCutoff = new Date(Date.now() + EXPIRY_WARNING_DAYS * 86_400_000);
  const now = new Date();

  const [vehicles, drivers, routes, riders, expiring, expiredLicences, maintenanceCost] =
    await Promise.all([
      prisma.vehicle.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
        _sum: { capacity: true },
      }),
      prisma.driver.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.transportRoute.count({ where: { deletedAt: null, isActive: true } }),
      prisma.studentTransport.count({ where: { status: 'ACTIVE' } }),
      prisma.vehicle.count({
        where: {
          deletedAt: null,
          OR: [
            { insuranceExpiry: { lte: warningCutoff } },
            { fitnessExpiry: { lte: warningCutoff } },
            { pollutionExpiry: { lte: warningCutoff } },
          ],
        },
      }),
      prisma.driver.count({ where: { deletedAt: null, licenseExpiry: { lt: now } } }),
      prisma.vehicleMaintenance.aggregate({
        where: { serviceDate: { gte: new Date(now.getFullYear(), 0, 1) } },
        _sum: { cost: true },
      }),
    ]);

  const byStatus = vehicles.reduce<Record<string, { count: number; capacity: number }>>(
    (accumulator, row) => {
      accumulator[row.status] = {
        count: row._count._all,
        capacity: row._sum.capacity ?? 0,
      };
      return accumulator;
    },
    {},
  );

  const totalCapacity = Object.values(byStatus).reduce((sum, row) => sum + row.capacity, 0);
  const activeCapacity = byStatus['ACTIVE']?.capacity ?? 0;

  return {
    vehicleCount: Object.values(byStatus).reduce((sum, row) => sum + row.count, 0),
    activeVehicles: byStatus['ACTIVE']?.count ?? 0,
    inMaintenance: byStatus['MAINTENANCE']?.count ?? 0,
    activeDrivers: drivers,
    activeRoutes: routes,
    studentsAllocated: riders,
    totalCapacity,
    seatsRemaining: Math.max(0, activeCapacity - riders),
    utilisationPercent:
      activeCapacity === 0 ? null : Number(((riders / activeCapacity) * 100).toFixed(1)),
    documentsExpiringSoon: expiring,
    expiredLicences,
    maintenanceSpendThisYear: (maintenanceCost._sum.cost ?? new Prisma.Decimal(0)).toFixed(2),
  };
}

/** Flat rows for the transport allocation report. */
export async function getTransportReportRows(routeId?: string) {
  const allocations = await prisma.studentTransport.findMany({
    where: { status: 'ACTIVE', ...(routeId ? { routeId } : {}) },
    include: transportAllocationInclude,
    orderBy: [{ route: { name: 'asc' } }, { stop: { sequence: 'asc' } }],
  });

  return allocations.map((allocation) => ({
    Route: allocation.route.name,
    'Route Code': allocation.route.code,
    Vehicle: allocation.route.vehicle?.registrationNumber ?? '',
    Driver: allocation.route.driver
      ? `${allocation.route.driver.firstName} ${allocation.route.driver.lastName}`
      : '',
    'Driver Phone': allocation.route.driver?.phone ?? '',
    Stop: allocation.stop.name,
    'Pickup Time': allocation.stop.pickupTime,
    'Drop Time': allocation.stop.dropTime,
    'Admission Number': allocation.student.admissionNumber,
    Student: `${allocation.student.user.firstName} ${allocation.student.user.lastName}`,
    Class: allocation.student.class?.name ?? '',
    Section: allocation.student.section?.name ?? '',
    Phone: allocation.student.user.phone ?? '',
    Fare: Number(allocation.fare),
  }));
}
