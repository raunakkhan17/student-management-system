import { Router } from 'express';
import * as controller from '@/controllers/audit.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { auditLogQuerySchema } from '@/validators/audit.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('AUDIT_LOGS', 'VIEW');

/**
 * PRD Module 20. The trail is append-only — reading it is the entire public
 * surface, and there is deliberately no route that edits or removes an entry.
 */
router.get('/actors', canView, controller.actors);

router.get('/', canView, validate({ query: auditLogQuerySchema }), controller.list);

export default router;
