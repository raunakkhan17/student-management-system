import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import type { ApiFieldError } from '@/types/api';
import { AppError } from '@/utils/api-error';
import { sendError } from '@/utils/api-response';

interface NormalizedError {
  statusCode: number;
  message: string;
  errors: ApiFieldError[];
  /** Expected failures are logged at warn; everything else at error with a stack. */
  isOperational: boolean;
}

function zodToFieldErrors(error: ZodError): ApiFieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

function normalizePrismaKnownError(
  error: Prisma.PrismaClientKnownRequestError,
): NormalizedError {
  const target = error.meta?.['target'];
  const fields = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];

  switch (error.code) {
    case 'P2002':
      return {
        statusCode: 409,
        message: 'A record with these details already exists',
        errors: fields.length
          ? fields.map((field) => ({ field, message: `${field} is already in use`, code: 'DUPLICATE' }))
          : [{ field: '', message: 'Duplicate value', code: 'DUPLICATE' }],
        isOperational: true,
      };

    case 'P2003':
      return {
        statusCode: 409,
        message: 'Related record is missing or still referenced',
        errors: [
          {
            field: typeof error.meta?.['field_name'] === 'string' ? error.meta['field_name'] : '',
            message: 'Foreign key constraint failed',
            code: 'FOREIGN_KEY',
          },
        ],
        isOperational: true,
      };

    case 'P2014':
      return {
        statusCode: 409,
        message: 'This change would break a required relation',
        errors: [],
        isOperational: true,
      };

    case 'P2025':
      return {
        statusCode: 404,
        message: 'The requested record was not found',
        errors: [],
        isOperational: true,
      };

    default:
      return {
        statusCode: 500,
        message: 'A database error occurred',
        errors: [],
        isOperational: false,
      };
  }
}

function normalize(error: unknown): NormalizedError {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      errors: error.errors,
      isOperational: error.isOperational,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 422,
      message: 'Validation failed',
      errors: zodToFieldErrors(error),
      isOperational: true,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return normalizePrismaKnownError(error);
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: 400,
      message: 'The request could not be processed',
      errors: [],
      isOperational: false,
    };
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return {
      statusCode: 400,
      message: 'Malformed JSON in request body',
      errors: [],
      isOperational: true,
    };
  }

  return {
    statusCode: 500,
    message: 'An unexpected error occurred',
    errors: [],
    isOperational: false,
  };
}

/**
 * Terminal error handler. Every thrown value is funnelled into the standard
 * failure envelope; internal details are withheld in production.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  // Express identifies error handlers by arity — `next` must stay in the signature.
  _next: NextFunction,
): void {
  const normalized = normalize(error);

  const context = {
    method: req.method,
    path: req.originalUrl,
    statusCode: normalized.statusCode,
    userId: req.user?.id ?? null,
  };

  if (normalized.isOperational) {
    logger.warn(normalized.message, context);
  } else {
    logger.error(normalized.message, {
      ...context,
      stack: error instanceof Error ? error.stack : String(error),
    });
  }

  const clientMessage =
    !normalized.isOperational && env.isProduction
      ? 'An unexpected error occurred'
      : normalized.message;

  sendError(res, clientMessage, normalized.statusCode, normalized.errors);
}
