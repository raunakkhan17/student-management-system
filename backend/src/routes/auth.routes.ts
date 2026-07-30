import { Router } from 'express';
import * as authController from '@/controllers/auth.controller';
import { authenticate } from '@/middleware/authenticate';
import { authRateLimiter } from '@/middleware/rate-limit';
import { validate } from '@/middleware/validate';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from '@/validators/auth.validator';

const router = Router();

// Credential endpoints carry a tighter limit than the rest of the API.
router.post('/login', authRateLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh', authController.refresh);
router.post(
  '/forgot-password',
  authRateLimiter,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  authController.resetPassword,
);

// `logout` runs without `authenticate` so an expired session can still be cleared.
router.post('/logout', authController.logout);

router.use(authenticate);

router.get('/me', authController.me);
router.get('/permissions', authController.permissions);
router.post(
  '/change-password',
  validate({ body: changePasswordSchema }),
  authController.changePassword,
);

export default router;
