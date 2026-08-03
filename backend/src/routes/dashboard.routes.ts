import { Router } from 'express';
import * as controller from '@/controllers/dashboard.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { dashboardChartsQuerySchema } from '@/validators/dashboard.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('DASHBOARD', 'VIEW');

/** Widgets. Served separately from the charts so the tiles paint first. */
router.get('/summary', canView, controller.getSummary);

router.get(
  '/charts',
  canView,
  validate({ query: dashboardChartsQuerySchema }),
  controller.getCharts,
);

export default router;
