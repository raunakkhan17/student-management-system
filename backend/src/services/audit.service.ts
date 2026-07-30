import { Prisma } from '@prisma/client';
import type { AppModule, AuditAction } from '@prisma/client';
import type { Request } from 'express';
import { logger } from '@/config/logger';
import { prisma } from '@/config/prisma';
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

  if (Array.isArray(value)) {
    return value.map((item) => redact(item)) as Prisma.InputJsonValue;
  }

  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = REDACTED_KEYS.has(key) ? '[REDACTED]' : redact(nested);
    }
    return output as Prisma.InputJsonValue;
  }

  if (typeof value === 'bigint') return value.toString();

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
