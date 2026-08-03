'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/use-auth';
import { settingsService } from '@/services/settings.service';
import type { AttendanceRules } from '@/types/settings';

const formSchema = z.object({
  minAttendancePercent: z.coerce.number().min(0).max(100),
  lateThresholdMinutes: z.coerce.number().int().min(0).max(240),
  halfDayThresholdMinutes: z.coerce.number().int().min(0).max(600),
  autoLockAfterHours: z.coerce.number().int().min(1).max(720),
  allowBackdatedDays: z.coerce.number().int().min(0).max(90),
  countLateAsPresent: z.boolean(),
});

type FormValues = z.input<typeof formSchema>;

const FIELDS = [
  {
    name: 'minAttendancePercent',
    label: 'Minimum attendance',
    description: 'Students below this are flagged as short of the requirement.',
    unit: '%',
  },
  {
    name: 'lateThresholdMinutes',
    label: 'Late after',
    description: 'Arriving past this many minutes is recorded as late.',
    unit: 'minutes',
  },
  {
    name: 'halfDayThresholdMinutes',
    label: 'Half day after',
    description: 'Arriving past this many minutes counts as a half day.',
    unit: 'minutes',
  },
  {
    name: 'autoLockAfterHours',
    label: 'Auto-lock register after',
    description: 'A submitted register can no longer be edited after this.',
    unit: 'hours',
  },
  {
    name: 'allowBackdatedDays',
    label: 'Allow backdated marking',
    description: 'How far back a teacher may still mark attendance.',
    unit: 'days',
  },
] as const;

export function AttendanceRulesTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = can('SETTINGS', 'EDIT');

  const query = useQuery({
    queryKey: ['settings', 'attendance-rules'],
    queryFn: () => settingsService.getAttendanceRules(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      minAttendancePercent: 75,
      lateThresholdMinutes: 15,
      halfDayThresholdMinutes: 120,
      autoLockAfterHours: 24,
      allowBackdatedDays: 7,
      countLateAsPresent: true,
    },
  });

  const [loadedFrom, setLoadedFrom] = useState<AttendanceRules | undefined>(undefined);
  if (query.data && query.data !== loadedFrom) {
    setLoadedFrom(query.data);
    form.reset({
      minAttendancePercent: Number(query.data.minAttendancePercent),
      lateThresholdMinutes: query.data.lateThresholdMinutes,
      halfDayThresholdMinutes: query.data.halfDayThresholdMinutes,
      autoLockAfterHours: query.data.autoLockAfterHours,
      allowBackdatedDays: query.data.allowBackdatedDays,
      countLateAsPresent: query.data.countLateAsPresent,
    });
  }

  const mutation = useMutation({
    mutationFn: (values: FormValues) => settingsService.saveAttendanceRules(formSchema.parse(values)),
    onSuccess: async () => {
      toast.success('Attendance rules saved');
      await queryClient.invalidateQueries({ queryKey: ['settings', 'attendance-rules'] });
    },
    onError: () => toast.error('Could not save the attendance rules'),
  });

  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutateAsync(values))}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Attendance rules</CardTitle>
            <CardDescription>
              Applies to {query.data?.academicYear?.name ?? 'the current academic year'}. Each
              academic year keeps its own rules.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((item) => (
              <FormField
                key={item.name}
                control={form.control}
                name={item.name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {item.label}{' '}
                      <span className="text-muted-foreground font-normal">({item.unit})</span>
                    </FormLabel>
                    <FormControl>
                      <Input type="number" {...field} disabled={!canEdit} />
                    </FormControl>
                    <FormDescription>{item.description}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}

            <FormField
              control={form.control}
              name="countLateAsPresent"
              render={({ field }) => (
                <FormItem className="flex items-start gap-3 sm:col-span-2">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <div>
                    <FormLabel>Count late arrivals as present</FormLabel>
                    <FormDescription>
                      When off, a late arrival does not count toward the attendance percentage.
                    </FormDescription>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.isPending || !form.formState.isDirty}>
              {mutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
