import type { ApiFieldError } from '@/types/api';

/**
 * Base class for every error the API deliberately produces.
 * `isOperational` distinguishes expected failures (validation, auth, 404)
 * from programmer errors, which must never leak details to the client.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly errors: ApiFieldError[];
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    errors: ApiFieldError[] = [],
    isOperational = true,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, new.target);
  }
}

/** 400 — malformed request the client can fix. */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', errors: ApiFieldError[] = []) {
    super(message, 400, 'BAD_REQUEST', errors);
  }
}

/** 401 — no valid credentials were supplied. */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', errors: ApiFieldError[] = []) {
    super(message, 401, 'UNAUTHORIZED', errors);
  }
}

/** 403 — authenticated, but not permitted (PRD §Module 1 acceptance criteria). */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action', errors: ApiFieldError[] = []) {
    super(message, 403, 'FORBIDDEN', errors);
  }
}

/** 404 — the addressed resource does not exist or is soft-deleted. */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

/** 409 — the request conflicts with current state (duplicate keys, locked records). */
export class ConflictError extends AppError {
  constructor(message = 'Request conflicts with the current state', errors: ApiFieldError[] = []) {
    super(message, 409, 'CONFLICT', errors);
  }
}

/** 422 — syntactically valid but semantically rejected. */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors: ApiFieldError[] = []) {
    super(message, 422, 'VALIDATION_ERROR', errors);
  }
}

/** 429 — rate limit exceeded. */
export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'TOO_MANY_REQUESTS');
  }
}

/** 500 — unexpected failure; never surfaced verbatim in production. */
export class InternalServerError extends AppError {
  constructor(message = 'An unexpected error occurred') {
    super(message, 500, 'INTERNAL_SERVER_ERROR', [], false);
  }
}
