import type { Response } from 'express';
import type {
  ApiFailureResponse,
  ApiFieldError,
  ApiSuccessResponse,
  PaginatedData,
  PaginationMeta,
} from '@/types/api';

/** Sends the standard success envelope. */
export function sendSuccess<TData>(
  res: Response,
  data: TData,
  message = 'Request completed successfully',
  statusCode = 200,
): Response<ApiSuccessResponse<TData>> {
  return res.status(statusCode).json({ success: true, data, message });
}

/** Sends the standard success envelope with a 201. */
export function sendCreated<TData>(
  res: Response,
  data: TData,
  message = 'Resource created successfully',
): Response<ApiSuccessResponse<TData>> {
  return sendSuccess(res, data, message, 201);
}

/** Sends a paginated list using the same envelope, with pagination nested in `data`. */
export function sendPaginated<TItem>(
  res: Response,
  items: TItem[],
  pagination: PaginationMeta,
  message = 'Request completed successfully',
): Response<ApiSuccessResponse<PaginatedData<TItem>>> {
  return sendSuccess(res, { items, pagination }, message);
}

/** Sends the standard failure envelope. */
export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  errors: ApiFieldError[] = [],
): Response<ApiFailureResponse> {
  return res.status(statusCode).json({ success: false, message, errors });
}
