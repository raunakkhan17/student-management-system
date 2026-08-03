'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Minus } from 'lucide-react';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { settingsService } from '@/services/settings.service';
import { AppModule, PermissionAction, ROLE_LABELS, type UserRole } from '@/types/enums';

/** Single letters keep 7 actions legible inside one cell. */
const ACTION_INITIALS: Record<PermissionAction, string> = {
  VIEW: 'V',
  CREATE: 'C',
  EDIT: 'E',
  DELETE: 'D',
  APPROVE: 'A',
  EXPORT: 'X',
  ASSIGN: 'S',
};

/**
 * Read-only by design. A grid editor here would let an administrator revoke
 * their own `SETTINGS:EDIT` and lock every account out of this screen, with no
 * way back through the UI. Grants are changed in the seed, where the change is
 * reviewable and reversible.
 */
export function PermissionsTab() {
  const query = useQuery({
    queryKey: ['settings', 'permissions'],
    queryFn: () => settingsService.getPermissionMatrix(),
  });

  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;

  const { roles, matrix, totalGrants } = query.data;
  const modules = Object.values(AppModule);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-muted-foreground text-sm">
          {totalGrants} grants across {roles.length} roles and {modules.length} modules. Changes are
          made through the database seed so they are reviewed before taking effect.
        </p>
        <p className="text-muted-foreground mt-2 text-xs">
          {Object.entries(ACTION_INITIALS)
            .map(([action, initial]) => `${initial} = ${action.toLowerCase()}`)
            .join(' · ')}
        </p>
      </div>

      {/* The matrix is wider than most viewports; it scrolls inside its own
          container so the page body never scrolls sideways. */}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="bg-card sticky left-0 min-w-40">Module</TableHead>
              {roles.map((role) => (
                <TableHead key={role} className="min-w-28 text-center">
                  {ROLE_LABELS[role as UserRole]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules.map((module) => (
              <TableRow key={module}>
                <TableCell className="bg-card sticky left-0 text-xs font-medium tracking-wide uppercase">
                  {module.replace(/_/g, ' ')}
                </TableCell>
                {roles.map((role) => {
                  const granted = matrix[role]?.[module] ?? [];

                  return (
                    <TableCell key={role} className="text-center">
                      {granted.length === 0 ? (
                        <Minus
                          className="text-muted-foreground/40 mx-auto size-3.5"
                          aria-label="No access"
                        />
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex flex-wrap justify-center gap-0.5">
                              {granted.map((action) => (
                                <span
                                  key={action}
                                  className="bg-primary-muted text-primary grid size-5 place-items-center rounded text-[10px] font-semibold"
                                >
                                  {ACTION_INITIALS[action]}
                                </span>
                              ))}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {granted.map((action) => action.toLowerCase()).join(', ')}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Check className="size-3.5" aria-hidden />
        Every grant shown here is enforced server-side on each request, not just in the interface.
      </p>
    </div>
  );
}
