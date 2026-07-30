'use client';

import { create } from 'zustand';
import { authService } from '@/services/auth.service';
import type { AuthUser, LoginPayload } from '@/types/auth';
import type { AppModule, PermissionAction } from '@/types/enums';
import { can } from '@/lib/permissions';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: AuthUser | null;
  permissions: Set<string>;
  status: AuthStatus;

  login: (payload: LoginPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
  setUser: (user: AuthUser) => void;
  clear: () => void;
  can: (module: AppModule, action: PermissionAction) => boolean;
}

/**
 * Session state for the signed-in user.
 *
 * Tokens are never held here — they live in httpOnly cookies the browser
 * attaches automatically, so nothing exploitable is reachable from JavaScript.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  permissions: new Set<string>(),
  status: 'idle',

  login: async (payload) => {
    set({ status: 'loading' });
    try {
      const result = await authService.login(payload);
      set({
        user: result.user,
        permissions: new Set(result.permissions),
        status: 'authenticated',
      });
      return result.user;
    } catch (error) {
      set({ user: null, permissions: new Set(), status: 'unauthenticated' });
      throw error;
    }
  },

  logout: async () => {
    try {
      await authService.logout();
    } finally {
      // Local state is cleared even if the network call fails, so the UI never
      // strands a user in a half-signed-out state.
      set({ user: null, permissions: new Set(), status: 'unauthenticated' });
    }
  },

  loadSession: async () => {
    set({ status: 'loading' });
    try {
      const { user, permissions } = await authService.me();
      set({ user, permissions: new Set(permissions), status: 'authenticated' });
    } catch {
      set({ user: null, permissions: new Set(), status: 'unauthenticated' });
    }
  },

  setUser: (user) => set({ user }),

  clear: () => set({ user: null, permissions: new Set(), status: 'unauthenticated' }),

  can: (module, action) => can(get().permissions, module, action),
}));

/** Selector helpers — components subscribe to the narrowest slice they need. */
export const selectUser = (state: AuthState) => state.user;
export const selectStatus = (state: AuthState) => state.status;
export const selectIsAuthenticated = (state: AuthState) => state.status === 'authenticated';
