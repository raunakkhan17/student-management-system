import rateLimit, { type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '@/config/env';
import { sendError } from '@/utils/api-response';

const windowMs = env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

/** Emits the standard failure envelope instead of the library default. */
const handler: Options['handler'] = (_req: Request, res: Response) => {
  sendError(res, 'Too many requests, please try again later', 429, [
    { field: '', message: 'Rate limit exceeded', code: 'TOO_MANY_REQUESTS' },
  ]);
};

const shared = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
} as const;

/** Baseline limiter applied to the whole API surface. */
export const apiRateLimiter = rateLimit({
  ...shared,
  windowMs,
  limit: env.RATE_LIMIT_MAX_REQUESTS,
});

/**
 * Tight limiter for credential endpoints (login, forgot/reset password).
 * Keyed on IP + submitted email so one attacker cannot lock out every user
 * from a shared NAT address, and successful logins are not counted.
 */
export const authRateLimiter = rateLimit({
  ...shared,
  windowMs,
  limit: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request): string => {
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.toLowerCase() : 'anonymous';
    return `${req.ip ?? 'unknown'}:${email}`;
  },
});
