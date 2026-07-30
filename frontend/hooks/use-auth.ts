'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/store/auth-store';
import type { AppModule, PermissionAction, UserRole } from '@/types/enums';

/** Convenience accessor for the signed-in user and their capabilities. */
export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  const status = useAuthStore((state) => state.status);
  const logout = useAuthStore((state) => state.logout);

  return useMemo(
    () => ({
      user,
      status,
      logout,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading' || status === 'idle',
      fullName: user ? `${user.firstName} ${user.lastName}` : '',
      initials: user ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() : '',
      can: (module: AppModule, action: PermissionAction) =>
        permissions.has(`${module}:${action}`),
      hasRole: (...roles: UserRole[]) => (user ? roles.includes(user.role) : false),
    }),
    [user, permissions, status, logout],
  );
}
