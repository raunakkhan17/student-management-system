import type { User } from '@prisma/client';
import crypto from 'node:crypto';
import { env } from '@/config/env';
import { prisma } from '@/config/prisma';
import type { TokenPair } from '@/types/auth';
import { UnauthorizedError } from '@/utils/api-error';
import { resolveExpiry, signAccessToken, signRefreshToken, verifyRefreshToken } from '@/utils/jwt';
import { hashToken } from '@/utils/password';

export interface IssueTokenContext {
  rememberMe: boolean;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Issues an access/refresh pair and persists the refresh token's hash.
 * Only the hash is stored, so a database leak cannot be replayed as a session.
 */
export async function issueTokenPair(
  user: Pick<User, 'id' | 'email' | 'role'>,
  { rememberMe, ipAddress, userAgent }: IssueTokenContext,
): Promise<TokenPair> {
  const jti = crypto.randomUUID();

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken({ sub: user.id, jti }, rememberMe);

  const accessTokenExpiresAt = resolveExpiry(env.JWT_ACCESS_EXPIRES_IN);
  const refreshTokenExpiresAt = resolveExpiry(
    rememberMe ? env.JWT_REFRESH_REMEMBER_EXPIRES_IN : env.JWT_REFRESH_EXPIRES_IN,
  );

  await prisma.refreshToken.create({
    data: {
      id: jti,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshTokenExpiresAt,
      ipAddress,
      userAgent,
    },
  });

  return { accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt };
}

/**
 * Validates a refresh token and rotates it.
 *
 * Reuse of an already-revoked token indicates the token was stolen, so every
 * session for that user is revoked rather than just rejecting the request.
 */
export async function rotateRefreshToken(
  presentedToken: string,
  context: Omit<IssueTokenContext, 'rememberMe'>,
): Promise<{ tokens: TokenPair; user: Pick<User, 'id' | 'email' | 'role'> }> {
  const payload = verifyRefreshToken(presentedToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { id: payload.jti },
    include: {
      user: { select: { id: true, email: true, role: true, status: true, deletedAt: true } },
    },
  });

  if (!stored || stored.tokenHash !== hashToken(presentedToken)) {
    throw new UnauthorizedError('Session is no longer valid, please sign in again');
  }

  if (stored.revokedAt) {
    await revokeAllUserTokens(stored.userId);
    throw new UnauthorizedError('Session was reused and has been terminated. Please sign in again.');
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedError('Session expired, please sign in again');
  }

  if (stored.user.deletedAt || stored.user.status !== 'ACTIVE') {
    throw new UnauthorizedError('This account is no longer active');
  }

  // A "remember me" session keeps its longer lifetime across rotations.
  const originalLifetimeMs = stored.expiresAt.getTime() - stored.createdAt.getTime();
  const rememberThresholdMs = resolveExpiry(env.JWT_REFRESH_EXPIRES_IN).getTime() - Date.now();
  const rememberMe = originalLifetimeMs > rememberThresholdMs * 1.5;

  const tokens = await issueTokenPair(stored.user, { ...context, rememberMe });

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return { tokens, user: stored.user };
}

/** Revokes a single session (sign-out on this device). */
export async function revokeRefreshToken(presentedToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(presentedToken);
    await prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // An unreadable token means there is nothing to revoke; sign-out still succeeds.
  }
}

/** Revokes every active session for a user (password change, suspected theft). */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Removes expired and long-revoked rows. Safe to run on a schedule. */
export async function purgeStaleTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }],
    },
  });
  return count;
}
