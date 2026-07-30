import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '@/config/prisma';
import type { AuthenticatedUser } from '@/types/auth';
import { UnauthorizedError } from '@/utils/api-error';
import { asyncHandler } from '@/utils/async-handler';
import { verifyAccessToken } from '@/utils/jwt';

export const ACCESS_TOKEN_COOKIE = 'educore_access_token';
export const REFRESH_TOKEN_COOKIE = 'educore_refresh_token';

function extractToken(req: Request): string | null {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token) return token;
  }

  const cookieToken = (req.cookies as Record<string, string | undefined> | undefined)?.[
    ACCESS_TOKEN_COOKIE
  ];
  return cookieToken ?? null;
}

/**
 * Verifies the access token and resolves the caller.
 *
 * The user row is re-read on every request rather than trusted from the token,
 * so deactivation, deletion and role changes take effect immediately instead of
 * waiting for the access token to expire.
 */
export const authenticate: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) {
      throw new UnauthorizedError('Authentication required');
    }

    const payload = verifyAccessToken(token);

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        firstName: true,
        lastName: true,
        studentProfile: { select: { id: true } },
        teacherProfile: { select: { id: true } },
        guardianProfile: { select: { id: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedError('Account no longer exists');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError(
        user.status === 'SUSPENDED'
          ? 'This account has been suspended'
          : 'This account is not active',
      );
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      studentId: user.studentProfile?.id ?? null,
      teacherId: user.teacherProfile?.id ?? null,
      guardianId: user.guardianProfile?.id ?? null,
    };

    req.user = authenticatedUser;
    next();
  },
);

/** Guarantees `req.user` is present for handlers that run behind `authenticate`. */
export function requireUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return req.user;
}
