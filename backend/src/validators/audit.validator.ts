import { AppModule, AuditAction } from '@prisma/client';
import { z } from 'zod';
import { dateOnlySchema, paginationQuerySchema } from './common.validator';

export const auditLogQuerySchema = paginationQuerySchema.extend({
  userId: z.string().uuid().optional(),
  action: z.nativeEnum(AuditAction).optional(),
  module: z.nativeEnum(AppModule).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(60).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
