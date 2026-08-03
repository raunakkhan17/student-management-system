import type { Metadata } from 'next';
import { AuditLogList } from '@/components/audit/audit-log-list';

export const metadata: Metadata = {
  title: 'Audit log',
};

export default function AuditLogsPage() {
  return <AuditLogList />;
}
