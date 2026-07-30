import type { ListQueryOptions, PaginationMeta, SortOrder } from '@/types/api';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

interface ParsedListQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
}

interface ParseOptions {
  /** Whitelist of sortable columns. Anything else falls back to `defaultSortBy`. */
  allowedSortFields: readonly string[];
  defaultSortBy: string;
  defaultSortOrder?: SortOrder;
}

/**
 * Normalizes validated query params into Prisma-ready pagination options.
 * Sort fields are whitelisted so a client can never sort by an arbitrary column.
 */
export function buildListQuery(query: ParsedListQuery, options: ParseOptions): ListQueryOptions {
  const page = Math.max(query.page ?? DEFAULT_PAGE, 1);
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const requestedSortBy = query.sortBy;
  const sortBy =
    requestedSortBy && options.allowedSortFields.includes(requestedSortBy)
      ? requestedSortBy
      : options.defaultSortBy;

  const search = query.search?.trim();

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
    ...(search ? { search } : {}),
    sortBy,
    sortOrder: query.sortOrder ?? options.defaultSortOrder ?? 'desc',
  };
}

export function buildPaginationMeta(
  totalItems: number,
  { page, limit }: Pick<ListQueryOptions, 'page' | 'limit'>,
): PaginationMeta {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);

  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}

/**
 * Builds a nested Prisma `orderBy` from a dotted field path.
 * `"user.lastName"` becomes `{ user: { lastName: "asc" } }`.
 */
export function buildOrderBy(sortBy: string, sortOrder: SortOrder): Record<string, unknown> {
  const segments = sortBy.split('.');
  return segments.reduceRight<Record<string, unknown>>(
    (accumulator, segment, index) =>
      index === segments.length - 1 ? { [segment]: sortOrder } : { [segment]: accumulator },
    {},
  );
}
