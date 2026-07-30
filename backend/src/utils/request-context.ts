import type { Request } from 'express';

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Extracts client metadata for audit logging. `X-Forwarded-For` is only
 * trusted because `trust proxy` is configured on the app.
 */
export function getRequestContext(req: Request): RequestContext {
  const userAgent = req.get('user-agent');
  return {
    ipAddress: req.ip ?? null,
    userAgent: userAgent ?? null,
  };
}
