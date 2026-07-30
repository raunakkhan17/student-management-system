import { Router } from 'express';
import * as controller from '@/controllers/transport.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { uuidParamSchema } from '@/validators/common.validator';
import {
  allocateTransportSchema,
  createDriverSchema,
  createMaintenanceSchema,
  createRouteSchema,
  createVehicleSchema,
  driverQuerySchema,
  endTransportSchema,
  maintenanceQuerySchema,
  routeQuerySchema,
  setRouteStopsSchema,
  transportAllocationQuerySchema,
  updateDriverSchema,
  updateRouteSchema,
  updateVehicleSchema,
  vehicleQuerySchema,
} from '@/validators/facility.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('TRANSPORT', 'VIEW');
const canCreate = requirePermission('TRANSPORT', 'CREATE');
const canEdit = requirePermission('TRANSPORT', 'EDIT');
const canDelete = requirePermission('TRANSPORT', 'DELETE');
const canExport = requirePermission('TRANSPORT', 'EXPORT');
const canAssign = requirePermission('TRANSPORT', 'ASSIGN');

// ------------------------------------------------------------- Stats & reports
router.get('/stats', canView, controller.getStats);
router.get('/reports/riders', canExport, controller.exportReport);

// ------------------------------------------------------------------- Vehicles
router
  .route('/vehicles')
  .get(canView, validate({ query: vehicleQuerySchema }), controller.listVehicles)
  .post(canCreate, validate({ body: createVehicleSchema }), controller.createVehicle);

router.get('/vehicles/options', canView, controller.listVehicleOptions);

router
  .route('/vehicles/:id')
  .patch(canEdit, validate({ params: uuidParamSchema, body: updateVehicleSchema }), controller.updateVehicle)
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteVehicle);

// -------------------------------------------------------------------- Drivers
router
  .route('/drivers')
  .get(canView, validate({ query: driverQuerySchema }), controller.listDrivers)
  .post(canCreate, validate({ body: createDriverSchema }), controller.createDriver);

router.get('/drivers/options', canView, controller.listDriverOptions);

router
  .route('/drivers/:id')
  .patch(canEdit, validate({ params: uuidParamSchema, body: updateDriverSchema }), controller.updateDriver)
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteDriver);

// ---------------------------------------------------------------- Maintenance
router
  .route('/maintenance')
  .get(canView, validate({ query: maintenanceQuerySchema }), controller.listMaintenance)
  .post(canCreate, validate({ body: createMaintenanceSchema }), controller.logMaintenance);

// ----------------------------------------------------------------- Allocations
router
  .route('/allocations')
  .get(canView, validate({ query: transportAllocationQuerySchema }), controller.listAllocations)
  .post(canAssign, validate({ body: allocateTransportSchema }), controller.allocateTransport);

router.post(
  '/allocations/:id/end',
  canAssign,
  validate({ params: uuidParamSchema, body: endTransportSchema }),
  controller.endAllocation,
);

// --------------------------------------------------------------------- Routes
router
  .route('/routes')
  .get(canView, validate({ query: routeQuerySchema }), controller.listRoutes)
  .post(canCreate, validate({ body: createRouteSchema }), controller.createRoute);

router
  .route('/routes/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getRoute)
  .patch(canEdit, validate({ params: uuidParamSchema, body: updateRouteSchema }), controller.updateRoute)
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteRoute);

router.put(
  '/routes/:id/stops',
  canEdit,
  validate({ params: uuidParamSchema, body: setRouteStopsSchema }),
  controller.setRouteStops,
);

export default router;
