import type { AppModule, PermissionAction, UserRole } from '@prisma/client';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { hasPermission } from '@/services/permission.service';
import { ForbiddenError, UnauthorizedError } from '@/utils/api-error';
import { asyncHandler } from '@/utils/async-handler';

/**
 * Coarse role gate. Prefer `requirePermission` for module access so the
 * matrix stays configurable (PRD §10); use this for structural rules such as
 * "only a student may submit an assignment".
 */
export function requireRoles(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError('Your role does not have access to this resource'));
      return;
    }

    next();
  };
}

/** Checks the configurable per-role permission matrix. */
export function requirePermission(module: AppModule, action: PermissionAction): RequestHandler {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const allowed = await hasPermission(req.user.role, module, action);
    if (!allowed) {
      throw new ForbiddenError(
        `Your role is not permitted to ${action.toLowerCase()} within ${module.toLowerCase()}`,
      );
    }

    next();
  });
}
