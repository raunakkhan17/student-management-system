import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '@/config/env';
import type { AccessTokenPayload, RefreshTokenPayload } from '@/types/auth';
import { UnauthorizedError } from './api-error';

type ExpiresIn = SignOptions['expiresIn'];

const ISSUER = 'educore-api';
const AUDIENCE = 'educore-web';

function baseOptions(expiresIn: string): SignOptions {
  return {
    expiresIn: expiresIn as ExpiresIn,
    issuer: ISSUER,
    audience: AUDIENCE,
  };
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign(
    { ...payload, type: 'access' } satisfies AccessTokenPayload,
    env.JWT_ACCESS_SECRET,
    baseOptions(env.JWT_ACCESS_EXPIRES_IN),
  );
}

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'type'>,
  rememberMe: boolean,
): string {
  const expiresIn = rememberMe
    ? env.JWT_REFRESH_REMEMBER_EXPIRES_IN
    : env.JWT_REFRESH_EXPIRES_IN;

  return jwt.sign(
    { ...payload, type: 'refresh' } satisfies RefreshTokenPayload,
    env.JWT_REFRESH_SECRET,
    baseOptions(expiresIn),
  );
}

function verify(token: string, secret: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, secret, { issuer: ISSUER, audience: AUDIENCE });
    if (typeof decoded === 'string') {
      throw new UnauthorizedError('Malformed token');
    }
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Session expired, please sign in again');
    }
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Invalid or malformed token');
  }
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = verify(token, env.JWT_ACCESS_SECRET);
  if (decoded.type !== 'access') {
    throw new UnauthorizedError('Invalid token type');
  }
  return decoded as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = verify(token, env.JWT_REFRESH_SECRET);
  if (decoded.type !== 'refresh') {
    throw new UnauthorizedError('Invalid token type');
  }
  return decoded as RefreshTokenPayload;
}

/** Resolves a duration string such as `15m`, `7d`, `30s` to an absolute expiry. */
export function resolveExpiry(duration: string, from: Date = new Date()): Date {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Unsupported duration format: ${duration}`);
  }

  const amount = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const unitMs: Record<typeof unit, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return new Date(from.getTime() + amount * unitMs[unit]);
}
