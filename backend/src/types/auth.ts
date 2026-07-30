import type { AppModule, PermissionAction, UserRole } from '@prisma/client';

/** The caller identity attached to every authenticated request. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  /** Populated when the user owns the corresponding domain profile. */
  studentId: string | null;
  teacherId: string | null;
  guardianId: string | null;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  /** Identifies the stored RefreshToken row so it can be rotated/revoked. */
  jti: string;
  type: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

/** A single `module:action` capability grant. */
export interface PermissionGrant {
  module: AppModule;
  action: PermissionAction;
}
