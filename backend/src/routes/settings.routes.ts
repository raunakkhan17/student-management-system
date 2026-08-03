import { Router } from 'express';
import * as controller from '@/controllers/settings.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import {
  attendanceRulesQuerySchema,
  attendanceRulesSchema,
  institutionSchema,
} from '@/validators/settings.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('SETTINGS', 'VIEW');
const canEdit = requirePermission('SETTINGS', 'EDIT');

/**
 * PRD Module 19. Academic session, grade system, fee configuration and
 * notification settings are served by the modules that own them; the settings
 * screen links to those rather than duplicating them here.
 */
router
  .route('/institution')
  .get(canView, controller.getInstitution)
  .put(canEdit, validate({ body: institutionSchema }), controller.saveInstitution);

router
  .route('/attendance-rules')
  .get(canView, validate({ query: attendanceRulesQuerySchema }), controller.getAttendanceRules)
  .put(canEdit, validate({ body: attendanceRulesSchema }), controller.saveAttendanceRules);

// Read-only: template bodies are seeded and changed in code, and the grant
// matrix is edited through the seed so a caller cannot revoke their own access.
router.get('/email-templates', canView, controller.listEmailTemplates);
router.get('/permissions', canView, controller.getPermissionMatrix);

export default router;
