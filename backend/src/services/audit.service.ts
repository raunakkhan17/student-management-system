import { Prisma } from '@prisma/client';
import type { AppModule, AuditAction } from '@prisma/client';
import type { Request } from 'express';
import { logger } from '@/config/logger';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { buildPaginationMeta } from '@/utils/pagination';
import { getRequestContext } from '@/utils/request-context';

export interface AuditInput {
  userId?: string | null;
  action: AuditAction;
  module: AppModule;
  entityType?: string;
  entityId?: string;
  description?: string;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Field names that must never be persisted into the audit trail. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'tokenHash',
  'accessToken',
  'refreshToken',
]);

/** Recursively strips secrets from a value before it is written to the audit log. */
export function redact(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;

  // Never data, and Prisma rejects the whole write if one reaches it.
  if (typeof value === 'function') return null;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item)) as Prisma.InputJsonValue;
  }

  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'bigint') return value.toString();

  if (typeof value === 'object') {
    // Prisma's Decimal — and anything else that knows how to serialise itself —
    // is taken at its word. Walking a Decimal's own properties instead would
    // expose decimal.js internals, including an enumerable `constructor`
    // function that Prisma refuses to store.
    const serialisable = value as { toJSON?: () => unknown };
    if (typeof serialisable.toJSON === 'function') {
      return redact(serialisable.toJSON());
    }

    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      // Drop the key rather than store null, so methods never appear as data.
      if (typeof nested === 'function') continue;
      output[key] = REDACTED_KEYS.has(key) ? '[REDACTED]' : redact(nested);
    }
    return output as Prisma.InputJsonValue;
  }

  return value as Prisma.InputJsonValue;
}

/**
 * Writes an audit entry (PRD Module 20). Auditing must never break the request
 * it describes, so failures are logged and swallowed.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        module: input.module,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        description: input.description ?? null,
        oldValue: input.oldValue ?? Prisma.JsonNull,
        newValue: input.newValue ?? Prisma.JsonNull,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    logger.error('Failed to write audit log', {
      action: input.action,
      module: input.module,
      entityId: input.entityId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Convenience wrapper that fills user/IP/user-agent from the request. */
export async function auditFromRequest(
  req: Request,
  input: Omit<AuditInput, 'userId' | 'ipAddress' | 'userAgent'>,
): Promise<void> {
  const { ipAddress, userAgent } = getRequestContext(req);
  await recordAudit({ ...input, userId: req.user?.id ?? null, ipAddress, userAgent });
}

const auditLogSelect = {
  id: true,
  action: true,
  module: true,
  entityType: true,
  entityId: true,
  description: true,
  oldValue: true,
  newValue: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
} satisfies Prisma.AuditLogSelect;

export interface AuditLogFilters {
  userId?: string;
  action?: AuditAction;
  module?: AppModule;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
}

/**
 * Reads the audit trail (PRD Module 20). Entries are immutable by design —
 * there is deliberately no update or delete path.
 */
export async function listAuditLogs(
  filters: AuditLogFilters,
  options: ListQueryOptions,
): Promise<PaginatedData<AuditLogEntry>> {
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.module ? { module: filters.module } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            // `to` arrives as a date, so include the whole of that day.
            ...(filters.to ? { lte: new Date(filters.to.getTime() + 86_399_999) } : {}),
          },
        }
      : {}),
    ...(options.search
      ? {
          OR: [
            { description: { contains: options.search, mode: 'insensitive' } },
            { entityId: { contains: options.search, mode: 'insensitive' } },
            { user: { firstName: { contains: options.search, mode: 'insensitive' } } },
            { user: { lastName: { contains: options.search, mode: 'insensitive' } } },
            { user: { email: { contains: options.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: auditLogSelect,
      orderBy: { createdAt: options.sortOrder },
      skip: options.skip,
      take: options.take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, options) };
}

export type AuditLogEntry = Prisma.AuditLogGetPayload<{ select: typeof auditLogSelect }>;

/** Distinct actors present in the trail, for the viewer's filter dropdown. */
export async function listAuditActors() {
  const rows = await prisma.auditLog.findMany({
    where: { userId: { not: null } },
    distinct: ['userId'],
    select: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return rows
    .map((row) => row.user)
    .filter((user): user is NonNullable<typeof user> => user !== null);
}
