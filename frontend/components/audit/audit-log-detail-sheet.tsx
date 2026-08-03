'use client';

import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatDateTime } from '@/lib/format';
import type { AuditLogEntry } from '@/types/audit';
import { AUDIT_ACTION_LABELS } from '@/types/enums';

interface Props {
  entry: AuditLogEntry | null;
  onOpenChange: (open: boolean) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function display(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value === '' ? '—' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * Field-by-field comparison of the before and after snapshots.
 *
 * Only fields that actually differ are listed — an update usually writes the
 * whole record, so showing every key would bury the change.
 */
function changedFields(oldValue: unknown, newValue: unknown) {
  if (!isRecord(oldValue) || !isRecord(newValue)) return null;

  const keys = [...new Set([...Object.keys(oldValue), ...Object.keys(newValue)])].sort();

  return keys
    .map((key) => ({ key, before: oldValue[key], after: newValue[key] }))
    .filter((row) => JSON.stringify(row.before) !== JSON.stringify(row.after));
}

export function AuditLogDetailSheet({ entry, onOpenChange }: Props) {
  const diff = entry ? changedFields(entry.oldValue, entry.newValue) : null;

  return (
    <Sheet open={entry !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {entry && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                <Badge>{AUDIT_ACTION_LABELS[entry.action]}</Badge>
                <span className="text-muted-foreground text-sm font-normal tracking-wide uppercase">
                  {entry.module.replace(/_/g, ' ')}
                </span>
              </SheetTitle>
              <SheetDescription>{entry.description ?? 'No description recorded.'}</SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6">
              <section>
                <h3 className="mb-2 text-sm font-semibold">Context</h3>
                <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">When</dt>
                  <dd>{formatDateTime(entry.createdAt)}</dd>

                  <dt className="text-muted-foreground">Who</dt>
                  <dd>
                    {entry.user
                      ? `${entry.user.firstName} ${entry.user.lastName} (${entry.user.email})`
                      : 'System'}
                  </dd>

                  <dt className="text-muted-foreground">Role</dt>
                  <dd>{entry.user?.role.replace(/_/g, ' ') ?? '—'}</dd>

                  <dt className="text-muted-foreground">IP address</dt>
                  <dd className="font-mono text-xs">{entry.ipAddress ?? '—'}</dd>

                  <dt className="text-muted-foreground">Entity</dt>
                  <dd>
                    {entry.entityType ?? '—'}
                    {entry.entityId && (
                      <span className="text-muted-foreground block font-mono text-xs">
                        {entry.entityId}
                      </span>
                    )}
                  </dd>

                  {entry.userAgent && (
                    <>
                      <dt className="text-muted-foreground">User agent</dt>
                      <dd className="text-muted-foreground text-xs break-words">
                        {entry.userAgent}
                      </dd>
                    </>
                  )}
                </dl>
              </section>

              {diff && diff.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">
                    Changed fields
                    <span className="text-muted-foreground ml-2 font-normal">{diff.length}</span>
                  </h3>
                  <ul className="divide-y rounded-lg border">
                    {diff.map((row) => (
                      <li key={row.key} className="px-3 py-2.5">
                        <p className="font-mono text-xs font-medium">{row.key}</p>
                        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                          <div className="bg-destructive-muted rounded px-2 py-1">
                            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                              Before
                            </p>
                            <p className="text-xs break-words">{display(row.before)}</p>
                          </div>
                          <div className="bg-success-muted rounded px-2 py-1">
                            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                              After
                            </p>
                            <p className="text-xs break-words">{display(row.after)}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Falls back to the raw snapshots when only one side was recorded
                  (a create or a delete), where a field diff has nothing to compare. */}
              {(!diff || diff.length === 0) && (entry.oldValue !== null || entry.newValue !== null) && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Recorded values</h3>
                  <div className="grid gap-3">
                    {entry.oldValue !== null && (
                      <div>
                        <p className="text-muted-foreground mb-1 text-xs">Before</p>
                        <pre className="bg-muted overflow-x-auto rounded-lg p-3 text-xs">
                          {JSON.stringify(entry.oldValue, null, 2)}
                        </pre>
                      </div>
                    )}
                    {entry.newValue !== null && (
                      <div>
                        <p className="text-muted-foreground mb-1 text-xs">After</p>
                        <pre className="bg-muted overflow-x-auto rounded-lg p-3 text-xs">
                          {JSON.stringify(entry.newValue, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
