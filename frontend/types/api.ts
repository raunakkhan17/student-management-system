/** Mirrors the backend's unified response contract (`backend/src/types/api.ts`). */

export interface ApiFieldError {
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

/** Query shape shared by every list endpoint. */
export interface ListQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
}
