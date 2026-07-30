import { Router } from 'express';
import { z } from 'zod';
import * as controller from '@/controllers/hostel.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { paginationQuerySchema, uuidParamSchema } from '@/validators/common.validator';
import {
  allocateRoomSchema,
  allocationQuerySchema,
  bulkRoomsSchema,
  checkOutVisitorSchema,
  complaintQuerySchema,
  createComplaintSchema,
  createHostelRoomSchema,
  createHostelSchema,
  createMessPlanSchema,
  createVisitorSchema,
  messPlanQuerySchema,
  reviewTransferSchema,
  roomQuerySchema,
  roomTransferSchema,
  subscribeMessSchema,
  transferQuerySchema,
  updateComplaintSchema,
  updateHostelRoomSchema,
  updateHostelSchema,
  vacateRoomSchema,
  visitorQuerySchema,
} from '@/validators/facility.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('HOSTEL', 'VIEW');
const canCreate = requirePermission('HOSTEL', 'CREATE');
const canEdit = requirePermission('HOSTEL', 'EDIT');
const canDelete = requirePermission('HOSTEL', 'DELETE');
const canExport = requirePermission('HOSTEL', 'EXPORT');
const canAssign = requirePermission('HOSTEL', 'ASSIGN');
const canApprove = requirePermission('HOSTEL', 'APPROVE');

const roomParam = z.object({ roomId: z.string().uuid() });

// ------------------------------------------------------------- Stats & reports
router.get('/stats', canView, controller.getStats);
router.get('/reports/occupancy', canExport, controller.exportReport);

// ---------------------------------------------------------------------- Rooms
router
  .route('/rooms')
  .get(canView, validate({ query: roomQuerySchema }), controller.listRooms)
  .post(canCreate, validate({ body: createHostelRoomSchema }), controller.createRoom);

router.post('/rooms/bulk', canCreate, validate({ body: bulkRoomsSchema }), controller.createRoomsInBulk);

router
  .route('/rooms/:roomId')
  .patch(canEdit, validate({ params: roomParam, body: updateHostelRoomSchema }), controller.updateRoom)
  .delete(canDelete, validate({ params: roomParam }), controller.deleteRoom);

// ----------------------------------------------------------------- Allocations
router
  .route('/allocations')
  .get(canView, validate({ query: allocationQuerySchema }), controller.listAllocations)
  .post(canAssign, validate({ body: allocateRoomSchema }), controller.allocateRoom);

router.post(
  '/allocations/:id/vacate',
  canAssign,
  validate({ params: uuidParamSchema, body: vacateRoomSchema }),
  controller.vacateRoom,
);

// -------------------------------------------------------------- Room transfers
router
  .route('/transfers')
  .get(canView, validate({ query: transferQuerySchema }), controller.listRoomTransfers)
  .post(canCreate, validate({ body: roomTransferSchema }), controller.requestRoomTransfer);

router.post(
  '/transfers/:id/review',
  canApprove,
  validate({ params: uuidParamSchema, body: reviewTransferSchema }),
  controller.reviewRoomTransfer,
);

// -------------------------------------------------------------------- Visitors
router
  .route('/visitors')
  .get(canView, validate({ query: visitorQuerySchema }), controller.listVisitors)
  .post(canCreate, validate({ body: createVisitorSchema }), controller.logVisitor);

router.post(
  '/visitors/:id/check-out',
  canEdit,
  validate({ params: uuidParamSchema, body: checkOutVisitorSchema }),
  controller.checkOutVisitor,
);

// ------------------------------------------------------------------ Mess plans
router
  .route('/mess-plans')
  .get(canView, validate({ query: messPlanQuerySchema }), controller.listMessPlans)
  .post(canCreate, validate({ body: createMessPlanSchema }), controller.createMessPlan);

router.post(
  '/mess-subscriptions',
  canAssign,
  validate({ body: subscribeMessSchema }),
  controller.subscribeToMessPlan,
);

// ------------------------------------------------------------------ Complaints
router
  .route('/complaints')
  .get(canView, validate({ query: complaintQuerySchema }), controller.listComplaints)
  .post(canCreate, validate({ body: createComplaintSchema }), controller.createComplaint);

router.patch(
  '/complaints/:id',
  canEdit,
  validate({ params: uuidParamSchema, body: updateComplaintSchema }),
  controller.updateComplaint,
);

// -------------------------------------------------------------------- Hostels
router
  .route('/')
  .get(canView, validate({ query: paginationQuerySchema }), controller.listHostels)
  .post(canCreate, validate({ body: createHostelSchema }), controller.createHostel);

router
  .route('/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getHostel)
  .patch(canEdit, validate({ params: uuidParamSchema, body: updateHostelSchema }), controller.updateHostel)
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteHostel);

export default router;
