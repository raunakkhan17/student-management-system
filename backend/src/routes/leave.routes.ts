import { Router } from 'express';
import * as controller from '@/controllers/leave.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { uuidParamSchema } from '@/validators/common.validator';
import {
  applyLeaveSchema,
  leaveBalanceQuerySchema,
  leaveCalendarQuerySchema,
  leaveQuerySchema,
  reviewLeaveSchema,
  saveLeaveBalancesSchema,
} from '@/validators/leave.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('LEAVE', 'VIEW');
const canCreate = requirePermission('LEAVE', 'CREATE');
const canApprove = requirePermission('LEAVE', 'APPROVE');
const canEdit = requirePermission('LEAVE', 'EDIT');

router.get('/stats', canView, controller.getStats);

router.get(
  '/calendar',
  canView,
  validate({ query: leaveCalendarQuerySchema }),
  controller.getCalendar,
);

router
  .route('/balances')
  .get(canView, validate({ query: leaveBalanceQuerySchema }), controller.getBalances)
  .put(canEdit, validate({ body: saveLeaveBalancesSchema }), controller.saveBalances);

router
  .route('/')
  .get(canView, validate({ query: leaveQuerySchema }), controller.listRequests)
  .post(canCreate, validate({ body: applyLeaveSchema }), controller.applyForLeave);

router.get('/:id', canView, validate({ params: uuidParamSchema }), controller.getRequest);

router.post(
  '/:id/review',
  canApprove,
  validate({ params: uuidParamSchema, body: reviewLeaveSchema }),
  controller.reviewRequest,
);

router.post(
  '/:id/cancel',
  canCreate,
  validate({ params: uuidParamSchema }),
  controller.cancelRequest,
);

export default router;
