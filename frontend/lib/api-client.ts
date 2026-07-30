import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { appConfig } from './config';
import type { ApiFailureResponse, ApiFieldError, ApiSuccessResponse } from '@/types/api';

/** Thrown for every non-2xx API response, carrying the server's field errors. */
export class ApiError extends Error {
  readonly status: number;
  readonly errors: ApiFieldError[];
  readonly isNetworkError: boolean;

  constructor(message: string, status: number, errors: ApiFieldError[] = [], isNetworkError = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.isNetworkError = isNetworkError;
  }

  /** Maps server field errors onto react-hook-form paths. */
  get fieldErrors(): Record<string, string> {
    const output: Record<string, string> = {};
    for (const error of this.errors) {
      // Strip the "body."/"query."/"params." prefix the API adds.
      const path = error.field.replace(/^(body|query|params)\./, '');
      if (path && !output[path]) {
        output[path] = error.message;
      }
    }
    return output;
  }
}

export const httpClient: AxiosInstance = axios.create({
  baseURL: appConfig.apiUrl,
  // Auth tokens live in httpOnly cookies, so every request must carry them.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

/** Endpoints that must never trigger a refresh-and-retry cycle. */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/forgot-password'];

let refreshPromise: Promise<void> | null = null;

/** Refreshes the session once, even when several requests fail concurrently. */
async function refreshSession(): Promise<void> {
  refreshPromise ??= httpClient
    .post('/auth/refresh')
    .then(() => undefined)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

function toApiError(error: AxiosError<ApiFailureResponse>): ApiError {
  if (!error.response) {
    return new ApiError(
      'Unable to reach the server. Check your connection and try again.',
      0,
      [],
      true,
    );
  }

  const { status, data } = error.response;
  return new ApiError(
    data?.message ?? 'Something went wrong. Please try again.',
    status,
    data?.errors ?? [],
  );
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiFailureResponse>) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const url = config?.url ?? '';

    const isRefreshable =
      status === 401 &&
      config !== undefined &&
      !config._retried &&
      !NO_REFRESH_PATHS.some((path) => url.includes(path));

    if (isRefreshable) {
      config._retried = true;
      try {
        await refreshSession();
        return await httpClient.request(config);
      } catch {
        // Refresh failed — fall through and surface the original 401 so the
        // auth store can clear state and redirect to sign-in.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('educore:session-expired'));
        }
      }
    }

    return Promise.reject(toApiError(error));
  },
);

/** Unwraps the success envelope, returning just `data`. */
async function request<TData>(config: AxiosRequestConfig): Promise<TData> {
  const response = await httpClient.request<ApiSuccessResponse<TData>>(config);
  return response.data.data;
}

export const api = {
  get: <TData>(url: string, config?: AxiosRequestConfig) =>
    request<TData>({ ...config, method: 'GET', url }),

  post: <TData>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<TData>({ ...config, method: 'POST', url, data }),

  patch: <TData>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<TData>({ ...config, method: 'PATCH', url, data }),

  put: <TData>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<TData>({ ...config, method: 'PUT', url, data }),

  delete: <TData>(url: string, config?: AxiosRequestConfig) =>
    request<TData>({ ...config, method: 'DELETE', url }),

  /** Multipart upload; the browser sets the boundary header itself. */
  upload: <TData>(url: string, formData: FormData, config?: AxiosRequestConfig) =>
    request<TData>({
      ...config,
      method: 'POST',
      url,
      data: formData,
      headers: { ...config?.headers, 'Content-Type': 'multipart/form-data' },
    }),
};
