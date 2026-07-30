import type { Prisma, UserRole } from '@prisma/client';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { prisma } from '@/config/prisma';
import type { AuthenticatedUser, TokenPair } from '@/types/auth';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '@/utils/api-error';
import {
  generateSecureToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '@/utils/password';
import { recordAudit } from './audit.service';
import { renderStoredTemplate, sendEmail } from './email.service';
import { listPermissionKeys } from './permission.service';
import { issueTokenPair, revokeAllUserTokens, rotateRefreshToken } from './token.service';

/** Everything the client needs to render the signed-in shell. */
const authUserSelect = {
  id: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  firstName: true,
  lastName: true,
  avatarId: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  studentProfile: {
    select: {
      id: true,
      admissionNumber: true,
      rollNumber: true,
      classId: true,
      sectionId: true,
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
    },
  },
  teacherProfile: {
    select: {
      id: true,
      employeeId: true,
      designation: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
    },
  },
  guardianProfile: {
    select: {
      id: true,
      relation: true,
      students: {
        select: {
          isPrimary: true,
          student: {
            select: {
              id: true,
              admissionNumber: true,
              user: { select: { firstName: true, lastName: true } },
              class: { select: { id: true, name: true } },
              section: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

export type AuthUserProfile = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface LoginResult {
  user: AuthUserProfile;
  permissions: string[];
  tokens: TokenPair;
}

/** Kept deliberately vague so the API never reveals which emails exist. */
const INVALID_CREDENTIALS = 'Incorrect email or password';

export async function login(
  email: string,
  password: string,
  rememberMe: boolean,
  expectedRole: UserRole | undefined,
  meta: RequestMeta,
): Promise<LoginResult> {
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: {
      ...authUserSelect,
      passwordHash: true,
      failedLoginCount: true,
      lockedUntil: true,
    },
  });

  if (!user) {
    // Hash anyway so response time does not reveal whether the account exists.
    await verifyPassword(password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    await recordAudit({
      action: 'LOGIN_FAILED',
      module: 'USERS',
      description: `Sign-in attempt for unknown address ${email}`,
      ...meta,
    });
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new ForbiddenError(
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    await registerFailedAttempt(user.id, user.failedLoginCount);
    await recordAudit({
      userId: user.id,
      action: 'LOGIN_FAILED',
      module: 'USERS',
      entityType: 'User',
      entityId: user.id,
      description: 'Incorrect password',
      ...meta,
    });
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }

  if (user.status !== 'ACTIVE') {
    throw new ForbiddenError(
      user.status === 'SUSPENDED'
        ? 'This account has been suspended. Contact your administrator.'
        : 'This account is not active. Contact your administrator.',
    );
  }

  // Role-based login (PRD Module 1): if the sign-in form scoped a role, the
  // account must actually hold it.
  if (expectedRole && user.role !== expectedRole) {
    throw new ForbiddenError('This account cannot sign in with the selected role');
  }

  const [tokens] = await Promise.all([
    issueTokenPair(user, { rememberMe, ...meta }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    }),
  ]);

  await recordAudit({
    userId: user.id,
    action: 'LOGIN',
    module: 'USERS',
    entityType: 'User',
    entityId: user.id,
    description: `Signed in as ${user.role}`,
    ...meta,
  });

  const { passwordHash: _passwordHash, failedLoginCount: _failed, lockedUntil: _locked, ...profile } = user;

  return {
    user: profile,
    permissions: await listPermissionKeys(user.role),
    tokens,
  };
}

/** Increments the failure counter and locks the account once the limit is hit. */
async function registerFailedAttempt(userId: string, currentCount: number): Promise<void> {
  const nextCount = currentCount + 1;
  const shouldLock = nextCount >= env.MAX_FAILED_LOGIN_ATTEMPTS;

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: shouldLock ? 0 : nextCount,
      lockedUntil: shouldLock ? new Date(Date.now() + env.ACCOUNT_LOCK_MINUTES * 60_000) : null,
    },
  });
}

export async function refreshSession(
  refreshToken: string,
  meta: RequestMeta,
): Promise<{ tokens: TokenPair; user: AuthUserProfile; permissions: string[] }> {
  const { tokens, user } = await rotateRefreshToken(refreshToken, meta);

  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: authUserSelect,
  });

  return { tokens, user: profile, permissions: await listPermissionKeys(profile.role) };
}

export async function getProfile(userId: string): Promise<{
  user: AuthUserProfile;
  permissions: string[];
}> {
  const user = await prisma.user.findFirstOrThrow({
    where: { id: userId, deletedAt: null },
    select: authUserSelect,
  });

  return { user, permissions: await listPermissionKeys(user.role) };
}

export async function changePassword(
  user: AuthenticatedUser,
  currentPassword: string,
  newPassword: string,
  meta: RequestMeta,
): Promise<void> {
  const record = await prisma.user.findFirstOrThrow({
    where: { id: user.id, deletedAt: null },
    select: { passwordHash: true },
  });

  if (!(await verifyPassword(currentPassword, record.passwordHash))) {
    throw new BadRequestError('Your current password is incorrect', [
      { field: 'currentPassword', message: 'Your current password is incorrect' },
    ]);
  }

  if (await verifyPassword(newPassword, record.passwordHash)) {
    throw new BadRequestError('Choose a password you have not used before', [
      { field: 'newPassword', message: 'The new password must differ from the current one' },
    ]);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  });

  // Every other session is invalidated so a stolen session cannot outlive the change.
  await revokeAllUserTokens(user.id);

  await recordAudit({
    userId: user.id,
    action: 'PASSWORD_CHANGE',
    module: 'USERS',
    entityType: 'User',
    entityId: user.id,
    description: 'Password changed by the account holder',
    ...meta,
  });
}

/**
 * Starts password recovery. Always resolves successfully — revealing whether an
 * address is registered would turn this into an account-enumeration oracle.
 */
export async function requestPasswordReset(email: string, meta: RequestMeta): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, email: true, firstName: true },
  });

  if (!user) {
    logger.info('Password reset requested for an unknown address', { email });
    return;
  }

  // Any earlier unused token is retired so only the newest link works.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const rawToken = generateSecureToken(32);
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60_000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt },
  });

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
  const variables = {
    firstName: user.firstName,
    resetUrl,
    expiryMinutes: String(env.PASSWORD_RESET_TOKEN_TTL_MINUTES),
  };

  const stored = await renderStoredTemplate('password-reset', variables);

  await sendEmail({
    to: user.email,
    subject: stored?.subject ?? 'Reset your EduCore password',
    html: stored?.html ?? fallbackResetEmail(variables),
    ...(stored ? { templateId: stored.id } : {}),
  });

  await recordAudit({
    userId: user.id,
    action: 'PASSWORD_RESET',
    module: 'USERS',
    entityType: 'User',
    entityId: user.id,
    description: 'Password reset link requested',
    ...meta,
  });
}

function fallbackResetEmail(variables: Record<string, string>): string {
  return `
    <p>Hello ${variables['firstName'] ?? ''},</p>
    <p>We received a request to reset your EduCore password.</p>
    <p><a href="${variables['resetUrl'] ?? '#'}">Reset your password</a></p>
    <p>This link expires in ${variables['expiryMinutes'] ?? '30'} minutes.
       If you did not request it, you can safely ignore this email.</p>
  `;
}

export async function resetPassword(
  rawToken: string,
  newPassword: string,
  meta: RequestMeta,
): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: { select: { id: true, status: true, deletedAt: true } } },
  });

  const isUsable =
    record !== null &&
    record.usedAt === null &&
    record.expiresAt.getTime() > Date.now() &&
    record.user.deletedAt === null &&
    record.user.status === 'ACTIVE';

  if (!isUsable) {
    throw new BadRequestError('This reset link is invalid or has expired', [
      { field: 'token', message: 'Request a new password reset link' },
    ]);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  await revokeAllUserTokens(record.userId);

  await recordAudit({
    userId: record.userId,
    action: 'PASSWORD_RESET',
    module: 'USERS',
    entityType: 'User',
    entityId: record.userId,
    description: 'Password reset completed',
    ...meta,
  });
}
