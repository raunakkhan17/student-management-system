import { Prisma } from '@prisma/client';
import { ConflictError } from './api-error';

/**
 * Builds the next sequential code for a year, e.g. `ADM/2026/0042`.
 *
 * Uniqueness is enforced by the column's unique index, not here. Under
 * concurrent inserts two callers can compute the same value, so callers wrap
 * the insert in `withUniqueRetry`.
 */
export function nextSequentialCode(options: {
  prefix: string;
  year: number;
  /** Highest existing code for this prefix/year, or null when none exist. */
  currentMax: string | null;
  padding?: number;
}): string {
  const padding = options.padding ?? 4;
  const separator = '/';

  const currentSuffix = options.currentMax?.split(separator).pop() ?? '0';
  const parsed = Number.parseInt(currentSuffix, 10);
  const next = Number.isNaN(parsed) ? 1 : parsed + 1;

  return `${options.prefix}${separator}${options.year}${separator}${String(next).padStart(padding, '0')}`;
}

/**
 * Runs `operation`, retrying when a unique-constraint violation on `field`
 * shows that two requests generated the same code concurrently.
 */
export async function withUniqueRetry<T>(
  operation: () => Promise<T>,
  field: string,
  maxAttempts = 5,
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const isDuplicate =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        String(error.meta?.['target'] ?? '').includes(field);

      if (!isDuplicate) throw error;
    }
  }

  throw new ConflictError(
    `Could not allocate a unique ${field} after ${maxAttempts} attempts. Please retry.`,
    [{ field, message: 'Identifier collision under concurrent load' }],
  );
}
