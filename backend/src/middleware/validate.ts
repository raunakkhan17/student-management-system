import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type AnyZodObject, type ZodTypeAny } from 'zod';
import type { ApiFieldError } from '@/types/api';
import { ValidationError } from '@/utils/api-error';

export interface RequestSchemas {
  body?: ZodTypeAny;
  query?: AnyZodObject;
  params?: AnyZodObject;
}

function toFieldErrors(error: ZodError, source: keyof RequestSchemas): ApiFieldError[] {
  return error.issues.map((issue) => ({
    field: [source, ...issue.path].join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Validates and *replaces* request segments with their parsed output, so
 * controllers receive coerced, trimmed, fully typed values.
 *
 * `req.query` is redefined rather than assigned: it is a getter-backed property
 * in newer Express versions, and defineProperty works in both.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: ApiFieldError[] = [];

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) {
        req.params = result.data as Request['params'];
      } else {
        errors.push(...toFieldErrors(result.error, 'params'));
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) {
        Object.defineProperty(req, 'query', {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } else {
        errors.push(...toFieldErrors(result.error, 'query'));
      }
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) {
        req.body = result.data;
      } else {
        errors.push(...toFieldErrors(result.error, 'body'));
      }
    }

    if (errors.length > 0) {
      next(new ValidationError('Validation failed', errors));
      return;
    }

    next();
  };
}
