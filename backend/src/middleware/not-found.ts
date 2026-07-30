import type { NextFunction, Request, Response } from 'express';
import { NotFoundError } from '@/utils/api-error';

/** Converts unmatched routes into the standard 404 envelope. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
}
