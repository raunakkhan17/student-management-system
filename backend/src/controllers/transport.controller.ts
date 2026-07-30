import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import { auditFromRequest, redact } from '@/services/audit.service';
import * as transportService from '@/services/transport.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { sendExport } from '@/utils/export';
import { buildListQuery } from '@/utils/pagination';
import type {
  AllocateTransportInput,
  CreateMaintenanceInput,
  CreateRouteInput,
  SetRouteStopsInput,
} from '@/validators/facility.validator';

const MODULE = 'TRANSPORT' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

function query(
  req: Request,
  allowedSortFields: readonly string[],
  defaultSortBy: string,
  defaultSortOrder: 'asc' | 'desc' = 'asc',
) {
  return buildListQuery(req.query, { allowedSortFields, defaultSortBy, defaultSortOrder });
}

// ------------------------------------------------------------------- Vehicles

export const listVehicles = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await transportService.listVehicles(
    query(req, ['registrationNumber', 'capacity', 'createdAt'], 'registrationNumber'),
    {
      status: req.query['status'] as never,
      type: req.query['type'] as never,
      expiringSoon: req.query['expiringSoon'] as boolean | undefined,
    },
  );

  sendPaginated(res, items, pagination, 'Vehicles retrieved successfully');
});

export const listVehicleOptions = asyncHandler(async (_req: Request, res: Response) => {
  const vehicles = await transportService.listVehicleOptions();
  sendSuccess(res, vehicles, 'Vehicles retrieved successfully');
});

export const createVehicle = asyncHandler(async (req: Request, res: Response) => {
  const vehicle = await transportService.createVehicle(req.body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Vehicle',
    entityId: vehicle.id,
    description: `Registered vehicle ${vehicle.registrationNumber}`,
    newValue: redact(req.body),
  });

  sendCreated(res, vehicle, 'Vehicle registered successfully');
});

export const updateVehicle = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const vehicle = await transportService.updateVehicle(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Vehicle',
    entityId: id,
    description: `Updated vehicle ${vehicle.registrationNumber}`,
    newValue: redact(req.body),
  });

  sendSuccess(res, vehicle, 'Vehicle updated successfully');
});

export const deleteVehicle = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await transportService.deleteVehicle(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Vehicle',
    entityId: id,
    description: 'Retired a vehicle',
  });

  sendSuccess(res, null, 'Vehicle retired successfully');
});

// -------------------------------------------------------------------- Drivers

export const listDrivers = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await transportService.listDrivers(
    query(req, ['firstName', 'employeeCode', 'licenseExpiry'], 'firstName'),
    {
      status: req.query['status'] as never,
      expiringSoon: req.query['expiringSoon'] as boolean | undefined,
    },
  );

  sendPaginated(res, items, pagination, 'Drivers retrieved successfully');
});

export const listDriverOptions = asyncHandler(async (_req: Request, res: Response) => {
  const drivers = await transportService.listDriverOptions();
  sendSuccess(res, drivers, 'Drivers retrieved successfully');
});

export const createDriver = asyncHandler(async (req: Request, res: Response) => {
  const driver = await transportService.createDriver(req.body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Driver',
    entityId: driver.id,
    description: `Added driver ${driver.firstName} ${driver.lastName} (${driver.employeeCode})`,
    newValue: redact(req.body),
  });

  sendCreated(res, driver, 'Driver added successfully');
});

export const updateDriver = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const driver = await transportService.updateDriver(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Driver',
    entityId: id,
    description: `Updated driver ${driver.firstName} ${driver.lastName}`,
    newValue: redact(req.body),
  });

  sendSuccess(res, driver, 'Driver updated successfully');
});

export const deleteDriver = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await transportService.deleteDriver(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Driver',
    entityId: id,
    description: 'Removed a driver',
  });

  sendSuccess(res, null, 'Driver removed successfully');
});

// --------------------------------------------------------------------- Routes

export const listRoutes = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await transportService.listRoutes(
    query(req, ['name', 'code', 'fare'], 'name'),
    {
      isActive: req.query['isActive'] as boolean | undefined,
      vehicleId: req.query['vehicleId'] as string | undefined,
      driverId: req.query['driverId'] as string | undefined,
    },
  );

  sendPaginated(res, items, pagination, 'Routes retrieved successfully');
});

export const getRoute = asyncHandler(async (req: Request, res: Response) => {
  const route = await transportService.getRoute(paramId(req));
  sendSuccess(res, route, 'Route retrieved successfully');
});

export const createRoute = asyncHandler(async (req: Request, res: Response) => {
  const route = await transportService.createRoute(req.body as CreateRouteInput);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'TransportRoute',
    entityId: route.id,
    description: `Created route ${route.name} (${route.code})`,
    newValue: redact(req.body),
  });

  sendCreated(res, route, 'Route created successfully');
});

export const updateRoute = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const route = await transportService.updateRoute(id, req.body as Partial<CreateRouteInput>);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'TransportRoute',
    entityId: id,
    description: `Updated route ${route.name}`,
    newValue: redact(req.body),
  });

  sendSuccess(res, route, 'Route updated successfully');
});

export const deleteRoute = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await transportService.deleteRoute(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'TransportRoute',
    entityId: id,
    description: 'Withdrew a route',
  });

  sendSuccess(res, null, 'Route withdrawn successfully');
});

export const setRouteStops = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const body = req.body as SetRouteStopsInput;
  const route = await transportService.setRouteStops(id, body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'RouteStop',
    entityId: id,
    description: `Set ${body.stops.length} stop(s) on route ${route.name}`,
    newValue: redact({ stops: body.stops.map((stop) => stop.name) }),
  });

  sendSuccess(res, route, 'Stops saved successfully');
});

// ----------------------------------------------------------------- Allocations

export const listAllocations = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await transportService.listTransportAllocations(
    query(req, ['startDate'], 'startDate', 'desc'),
    {
      routeId: req.query['routeId'] as string | undefined,
      stopId: req.query['stopId'] as string | undefined,
      studentId: req.query['studentId'] as string | undefined,
      academicYearId: req.query['academicYearId'] as string | undefined,
      status: req.query['status'] as never,
    },
  );

  sendPaginated(res, items, pagination, 'Transport allocations retrieved successfully');
});

export const allocateTransport = asyncHandler(async (req: Request, res: Response) => {
  const allocation = await transportService.allocateTransport(req.body as AllocateTransportInput);

  await auditFromRequest(req, {
    action: 'ASSIGN',
    module: MODULE,
    entityType: 'StudentTransport',
    entityId: allocation.id,
    description: `Assigned ${allocation.student.admissionNumber} to route ${allocation.route.name} at stop ${allocation.stop.name}`,
    newValue: redact({ routeId: allocation.routeId, stopId: allocation.stopId, fare: allocation.fare }),
  });

  sendCreated(res, allocation, 'Transport assigned successfully');
});

export const endAllocation = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const { endDate } = req.body as { endDate: Date };
  const allocation = await transportService.endTransportAllocation(id, endDate);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'StudentTransport',
    entityId: id,
    description: `Ended transport for ${allocation.student.admissionNumber} on route ${allocation.route.name}`,
  });

  sendSuccess(res, allocation, 'Transport allocation closed successfully');
});

// ---------------------------------------------------------------- Maintenance

export const listMaintenance = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await transportService.listMaintenance(
    query(req, ['serviceDate', 'cost'], 'serviceDate', 'desc'),
    {
      vehicleId: req.query['vehicleId'] as string | undefined,
      type: req.query['type'] as never,
      from: req.query['from'] as Date | undefined,
      to: req.query['to'] as Date | undefined,
    },
  );

  sendPaginated(res, items, pagination, 'Maintenance history retrieved successfully');
});

export const logMaintenance = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const record = await transportService.logMaintenance(req.body as CreateMaintenanceInput, user.id);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'VehicleMaintenance',
    entityId: record.id,
    description: `Logged ${record.type.toLowerCase().replace(/_/g, ' ')} for ${record.vehicle.registrationNumber}`,
    newValue: redact(req.body),
  });

  sendCreated(res, record, 'Maintenance logged successfully');
});

// ------------------------------------------------------------- Stats & reports

export const getStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await transportService.getTransportStats();
  sendSuccess(res, stats, 'Transport statistics retrieved successfully');
});

export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const format = (req.query['format'] as 'csv' | 'xlsx' | undefined) ?? 'xlsx';
  const rows = await transportService.getTransportReportRows(
    req.query['routeId'] as string | undefined,
  );

  await auditFromRequest(req, {
    action: 'EXPORT',
    module: MODULE,
    entityType: 'StudentTransport',
    description: `Exported ${rows.length} transport record(s)`,
  });

  await sendExport(
    res,
    rows,
    `transport-riders-${new Date().toISOString().slice(0, 10)}`,
    format,
    'Riders',
  );
});
