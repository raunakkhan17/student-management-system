import type { ListQueryParams } from './api';
import type { AppModule, AuditAction, UserRole } from './enums';

export interface AuditActor {
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  module: AppModule;
  entityType: string | null;
  entityId: string | null;
  description: string | null;
  /** Redacted server-side before storage — secrets never reach the client. */
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
  } | null;
}

export interface AuditLogQuery extends ListQueryParams {
  userId?: string;
  action?: AuditAction;
  module?: AppModule;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
}
