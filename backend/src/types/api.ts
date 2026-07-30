/**
 * Unified API response contract.
 *
 * Success: { success: true, data, message }
 * Failure: { success: false, message, errors }
 *
 * List endpoints nest pagination inside `data` so the envelope shape
 * stays identical across every endpoint.
 */

export interface ApiFieldError {
  /** Dot-path of the offending field, e.g. "guardians.0.phone". Empty for non-field errors. */
  field: string;
  message: string;
  code?: string;
}

export interface ApiSuccessResponse<TData> {
  success: true;
  data: TData;
  message: string;
}

export interface ApiFailureResponse {
  success: false;
  message: string;
  errors: ApiFieldError[];
}

export type ApiResponse<TData> = ApiSuccessResponse<TData> | ApiFailureResponse;

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedData<TItem> {
  items: TItem[];
  pagination: PaginationMeta;
}

export type SortOrder = 'asc' | 'desc';

export interface ListQueryOptions {
  page: number;
  limit: number;
  skip: number;
  take: number;
  search?: string;
  sortBy?: string;
  sortOrder: SortOrder;
}
