import { z } from 'zod';
import { MAX_LIMIT } from '@/utils/pagination';

/** A UUID route parameter, e.g. `/students/:id`. */
export const uuidParamSchema = z.object({
  id: z.string().uuid('A valid identifier is required'),
});

export const optionalUuid = z.string().uuid('A valid identifier is required').optional();

/** Trims and rejects empty strings, which HTML forms submit freely. */
export const requiredString = (field: string, max = 255) =>
  z.string().trim().min(1, `${field} is required`).max(max, `${field} must be at most ${max} characters`);

export const optionalString = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(255);

/** Accepts common Indian and international formats. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+]?[\d\s-]{7,20}$/, 'Enter a valid phone number');

export const dateSchema = z.coerce.date({ invalid_type_error: 'Enter a valid date' });

/** ISO date-only string, e.g. `2026-04-01`. */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

/** 24-hour clock time, e.g. `09:30`. */
export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the 24-hour format HH:MM');

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

/** Shared list query: page, limit, search, sortBy, sortOrder. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).default(20),
  search: z.string().trim().max(200).optional(),
  sortBy: z.string().trim().max(60).optional(),
  sortOrder: sortOrderSchema,
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Comma-separated query value to array, e.g. `?status=ACTIVE,INACTIVE`. */
export const csvToArray = (schema: z.ZodTypeAny) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const parts = Array.isArray(value) ? value : value.split(',');
      return parts.map((part) => part.trim()).filter(Boolean);
    })
    .pipe(z.array(schema).optional());
