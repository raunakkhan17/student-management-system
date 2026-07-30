import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { humanizeEnum } from '@/lib/format';

/** Semantic tone applied to a status value. */
export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground border-transparent',
  success: 'bg-success-muted text-success border-transparent',
  warning: 'bg-warning-muted text-warning border-transparent',
  danger: 'bg-destructive-muted text-destructive border-transparent',
  info: 'bg-info-muted text-info border-transparent',
};

/**
 * Maps every status enum in the product to a tone, so the same meaning always
 * reads the same colour regardless of which module renders it.
 */
const STATUS_TONE: Record<string, StatusTone> = {
  // Generic lifecycle
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  PENDING: 'warning',
  SUSPENDED: 'danger',
  ARCHIVED: 'neutral',
  CANCELLED: 'neutral',
  COMPLETED: 'success',
  UPCOMING: 'info',
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  SCHEDULED: 'info',
  EXPIRED: 'neutral',
  CLOSED: 'neutral',
  ONGOING: 'info',

  // People
  GRADUATED: 'info',
  TRANSFERRED: 'info',
  ON_LEAVE: 'warning',
  RESIGNED: 'neutral',
  RETIRED: 'neutral',
  TERMINATED: 'danger',

  // Approvals
  APPROVED: 'success',
  REJECTED: 'danger',

  // Attendance
  PRESENT: 'success',
  ABSENT: 'danger',
  LATE: 'warning',
  HALF_DAY: 'warning',
  LEAVE: 'info',
  HOLIDAY: 'neutral',
  SUBMITTED: 'info',
  LOCKED: 'neutral',

  // Finance
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  OVERDUE: 'danger',
  WAIVED: 'neutral',
  FAILED: 'danger',
  REFUNDED: 'info',

  // Library
  AVAILABLE: 'success',
  ISSUED: 'info',
  RESERVED: 'warning',
  LOST: 'danger',
  DAMAGED: 'danger',
  WITHDRAWN: 'neutral',
  RETURNED: 'success',
  READY: 'info',
  FULFILLED: 'success',

  // Facilities
  FULL: 'danger',
  PARTIALLY_OCCUPIED: 'warning',
  MAINTENANCE: 'warning',
  VACATED: 'neutral',
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',

  // Submissions
  EVALUATED: 'success',
  RESUBMIT: 'warning',
  RESULTS_PUBLISHED: 'success',
};

interface StatusBadgeProps {
  status: string | null | undefined;
  /** Overrides the derived tone when a module needs different semantics. */
  tone?: StatusTone;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, tone, label, className }: StatusBadgeProps) {
  if (!status) return <span className="text-muted-foreground">—</span>;

  const resolvedTone = tone ?? STATUS_TONE[status] ?? 'neutral';

  return (
    <Badge
      variant="outline"
      className={cn('font-medium', TONE_CLASS[resolvedTone], className)}
    >
      {label ?? humanizeEnum(status)}
    </Badge>
  );
}
