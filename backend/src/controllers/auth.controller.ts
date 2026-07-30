import type { CookieOptions, Request, Response } from 'express';
import { env } from '@/config/env';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, requireUser } from '@/middleware/authenticate';
import * as authService from '@/services/auth.service';
import { recordAudit } from '@/services/audit.service';
import { revokeRefreshToken } from '@/services/token.service';
import type { TokenPair } from '@/types/auth';
import { UnauthorizedError } from '@/utils/api-error';
import { sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { getRequestContext } from '@/utils/request-context';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
} from '@/validators/auth.validator';

function cookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    // Same-site in development (localhost:3000 → localhost:4000); real
    // deployments terminate TLS, so the cookie is marked secure there.
    secure: env.isProduction,
    sameSite: env.isProduction ? 'strict' : 'lax',
    domain: env.isProduction ? undefined : env.COOKIE_DOMAIN,
    path: '/',
    expires: expiresAt,
  };
}

/** Tokens are delivered as httpOnly cookies so client JavaScript cannot read them. */
function setAuthCookies(res: Response, tokens: TokenPair): void {
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, cookieOptions(tokens.accessTokenExpiresAt));
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, cookieOptions(tokens.refreshTokenExpiresAt));
}

function clearAuthCookies(res: Response): void {
  const base: CookieOptions = {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'strict' : 'lax',
    domain: env.isProduction ? undefined : env.COOKIE_DOMAIN,
    path: '/',
  };
  res.clearCookie(ACCESS_TOKEN_COOKIE, base);
  res.clearCookie(REFRESH_TOKEN_COOKIE, base);
}

function readRefreshCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[REFRESH_TOKEN_COOKIE] ?? null;
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, rememberMe, role } = req.body as LoginInput;
  const meta = getRequestContext(req);

  const result = await authService.login(email, password, rememberMe, role, meta);
  setAuthCookies(res, result.tokens);

  sendSuccess(
    res,
    {
      user: result.user,
      permissions: result.permissions,
      // Also returned in the body so non-browser clients can use Bearer auth.
      accessToken: result.tokens.accessToken,
      accessTokenExpiresAt: result.tokens.accessTokenExpiresAt,
    },
    'Signed in successfully',
  );
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = readRefreshCookie(req);
  if (!token) {
    throw new UnauthorizedError('No active session found');
  }

  const meta = getRequestContext(req);
  const result = await authService.refreshSession(token, meta);
  setAuthCookies(res, result.tokens);

  sendSuccess(
    res,
    {
      user: result.user,
      permissions: result.permissions,
      accessToken: result.tokens.accessToken,
      accessTokenExpiresAt: result.tokens.accessTokenExpiresAt,
    },
    'Session refreshed',
  );
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = readRefreshCookie(req);
  if (token) {
    await revokeRefreshToken(token);
  }

  const meta = getRequestContext(req);
  if (req.user) {
    await recordAudit({
      userId: req.user.id,
      action: 'LOGOUT',
      module: 'USERS',
      entityType: 'User',
      entityId: req.user.id,
      description: 'Signed out',
      ...meta,
    });
  }

  clearAuthCookies(res);
  sendSuccess(res, null, 'Signed out successfully');
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const profile = await authService.getProfile(user.id);
  sendSuccess(res, profile, 'Profile retrieved successfully');
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;

  await authService.changePassword(user, currentPassword, newPassword, getRequestContext(req));

  // Other sessions were revoked; clear this browser's cookies so the user
  // signs in again with the new credentials.
  clearAuthCookies(res);
  sendSuccess(res, null, 'Password changed successfully. Please sign in again.');
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as ForgotPasswordInput;
  await authService.requestPasswordReset(email, getRequestContext(req));

  // Deliberately identical whether or not the address is registered.
  sendSuccess(
    res,
    null,
    'If that email is registered, a password reset link is on its way.',
  );
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = req.body as ResetPasswordInput;
  await authService.resetPassword(token, newPassword, getRequestContext(req));
  sendSuccess(res, null, 'Password reset successfully. You can now sign in.');
});

export const permissions = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const profile = await authService.getProfile(user.id);
  sendSuccess(res, { permissions: profile.permissions }, 'Permissions retrieved successfully');
});
