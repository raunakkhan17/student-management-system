'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Scale, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { UserPicker } from '@/components/common/user-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { leaveService } from '@/services/leave.service';
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/types/leave';

const LEAVE_TYPES: LeaveType[] = [
  'SICK',
  'CASUAL',
  'EMERGENCY',
  'VACATION',
  'MATERNITY',
  'UNPAID',
  'OTHER',
];

export function LeaveBalancesTab() {
  const { can, user } = useAuth();
  const queryClient = useQueryClient();

  const canEditAllowances = can('LEAVE', 'EDIT');
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  // Only the fields the user has typed into; the rest fall back to the server
  // values at render, so nothing has to be mirrored in an effect.
  const [edits, setEdits] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ['leave', 'balances', targetUserId],
    queryFn: () => leaveService.getBalances(targetUserId ? { userId: targetUserId } : {}),
  });

  const allocatedFor = (type: LeaveType): string =>
    edits[type] ??
    query.data?.balances.find((balance) => balance.type === type)?.allocated ??
    '0';

  const mutation = useMutation({
    mutationFn: () => {
      const academicYearId = query.data?.academicYearId;
      if (!academicYearId) throw new Error('No academic year is set');

      return leaveService.saveBalances({
        userId: query.data?.userId ?? (user?.id as string),
        academicYearId,
        balances: LEAVE_TYPES.map((type) => ({
          type,
          allocated: Number(allocatedFor(type)),
        })).filter((balance) => Number.isFinite(balance.allocated)),
      });
    },
    onSuccess: async () => {
      toast.success('Leave allowances saved');
      setEdits({});
      await queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not save the allowances');
    },
  });

  const balances = query.data?.balances ?? [];
  const hasYear = Boolean(query.data?.academicYearId);

  return (
    <div className="space-y-4">
      {canEditAllowances && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Whose allowance</CardTitle>
            <CardDescription>
              Leave blank to view your own. Allowances are set per academic year.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-md">
              <UserPicker
                value={targetUserId}
                onChange={(id) => {
                  setTargetUserId(id);
                  setEdits({});
                }}
                clearable
                clearLabel="Myself"
                placeholder="Myself"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : !hasYear ? (
        <EmptyState
          icon={Scale}
          title="No academic year is set"
          description="Create a current academic year before allocating leave."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {LEAVE_TYPES.map((type) => {
              const row = balances.find((balance) => balance.type === type);
              const allocated = Number(row?.allocated ?? 0);
              const used = Number(row?.used ?? 0);
              const percent = allocated > 0 ? Math.min(100, (used / allocated) * 100) : 0;

              return (
                <Card key={type}>
                  <CardHeader>
                    <CardTitle className="text-base">{LEAVE_TYPE_LABELS[type]}</CardTitle>
                    <CardDescription>
                      {row ? `${row.remaining} of ${row.allocated} day(s) remaining` : 'No allowance set'}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <Progress value={percent} className="h-1.5" />

                    {canEditAllowances ? (
                      <div className="space-y-1.5">
                        <Label htmlFor={`allowance-${type}`}>Days allowed</Label>
                        <Input
                          id={`allowance-${type}`}
                          inputMode="decimal"
                          value={allocatedFor(type)}
                          onChange={(event) =>
                            setEdits((current) => ({ ...current, [type]: event.target.value }))
                          }
                        />
                        {used > 0 && (
                          <p className="text-muted-foreground text-xs">
                            {used} day(s) already taken; the allowance cannot go below this.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-2xl font-semibold tabular-nums">
                        {row?.remaining ?? '0'}
                        <span className="text-muted-foreground ml-1 text-sm font-normal">
                          day(s) left
                        </span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {canEditAllowances && (
            <div className="flex justify-end">
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                <Save className="size-4" aria-hidden />
                {mutation.isPending ? 'Saving…' : 'Save allowances'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
