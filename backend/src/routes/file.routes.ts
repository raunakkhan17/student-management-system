import { Router } from 'express';
import { downloadFile, getFileMetadata } from '@/controllers/file.controller';
import { authenticate } from '@/middleware/authenticate';
import { validate } from '@/middleware/validate';
import { uuidParamSchema } from '@/validators/common.validator';

const router = Router();

// Uploaded content is never served as static assets — every read is authorised.
router.use(authenticate);

router.get('/:id/meta', validate({ params: uuidParamSchema }), getFileMetadata);
router.get('/:id', validate({ params: uuidParamSchema }), downloadFile);

export default router;
