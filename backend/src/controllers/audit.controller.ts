import type { Request, Response } from 'express';
import * as auditService from '@/services/audit.service';
import { sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { buildListQuery } from '@/utils/pagination';
import type { AuditLogQuery } from '@/validators/audit.validator';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as AuditLogQuery;

  // `createdAt` is the only meaningful order for a trail, so sorting is fixed
  // and only the direction is caller-controlled.
  const options = buildListQuery(query, {
    allowedSortFields: ['createdAt'],
    defaultSortBy: 'createdAt',
    defaultSortOrder: 'desc',
  });

  const result = await auditService.listAuditLogs(
    {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.module ? { module: query.module } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
    },
    options,
  );

  sendPaginated(res, result.items, result.pagination, 'Audit log retrieved successfully');
});

export const actors = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await auditService.listAuditActors();
  sendSuccess(res, rows, 'Audit actors retrieved successfully');
});
