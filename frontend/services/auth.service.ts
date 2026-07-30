import { api } from '@/lib/api-client';
import type {
  ChangePasswordPayload,
  ForgotPasswordPayload,
  LoginPayload,
  LoginResponse,
  ProfileResponse,
  ResetPasswordPayload,
} from '@/types/auth';

export const authService = {
  login: (payload: LoginPayload) => api.post<LoginResponse>('/auth/login', payload),

  logout: () => api.post<null>('/auth/logout'),

  me: () => api.get<ProfileResponse>('/auth/me'),

  refresh: () => api.post<LoginResponse>('/auth/refresh'),

  forgotPassword: (payload: ForgotPasswordPayload) =>
    api.post<null>('/auth/forgot-password', payload),

  resetPassword: (payload: ResetPasswordPayload) => api.post<null>('/auth/reset-password', payload),

  changePassword: (payload: ChangePasswordPayload) =>
    api.post<null>('/auth/change-password', payload),
};
