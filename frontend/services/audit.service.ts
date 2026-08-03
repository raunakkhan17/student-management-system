import { api } from '@/lib/api-client';
import type { PaginatedData } from '@/types/api';
import type { AuditActor, AuditLogEntry, AuditLogQuery } from '@/types/audit';

const BASE = '/audit-logs';

export const auditService = {
  list: (params: AuditLogQuery) => api.get<PaginatedData<AuditLogEntry>>(BASE, { params }),

  /** Distinct actors present in the trail, for the filter dropdown. */
  listActors: () => api.get<AuditActor[]>(`${BASE}/actors`),
};
