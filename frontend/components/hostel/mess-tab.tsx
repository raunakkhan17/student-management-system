'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UserPlus, UtensilsCrossed } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { FormDialog } from '@/components/common/form-dialog';
import { StudentPicker } from '@/components/common/student-picker';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useHostelOptions } from '@/hooks/use-hostel-options';
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import { formatCurrency } from '@/lib/format';
import { hostelService } from '@/services/hostel.service';
import { MESS_PLAN_TYPE_LABELS, type MessPlan, type MessPlanType } from '@/types/hostel';

const ALL = '__all__';
const PLAN_FORM_ID = 'mess-plan-form';
const SUBSCRIBE_FORM_ID = 'mess-subscribe-form';
const PLAN_TYPES: MessPlanType[] = ['VEGETARIAN', 'NON_VEGETARIAN', 'MIXED'];

const planFormSchema = z.object({
  hostelId: z.string().uuid('Select a hostel'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  type: z.enum(['VEGETARIAN', 'NON_VEGETARIAN', 'MIXED']),
  monthlyCharge: z.coerce.number().nonnegative().max(999_999),
  description: z.string().trim().max(300).optional(),
  isActive: z.boolean(),
});

const subscribeFormSchema = z.object({
  studentId: z.string().uuid('Select a student'),
  messPlanId: z.string().uuid('Select a plan'),
  startDate: z.string().min(1, 'Choose a start date'),
  endDate: z.string().optional(),
});

type PlanFormValues = z.infer<typeof planFormSchema>;
type SubscribeFormValues = z.infer<typeof subscribeFormSchema>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MessTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const hostels = useHostelOptions();

  const [hostelFilter, setHostelFilter] = useState(ALL);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [subscribeTarget, setSubscribeTarget] = useState<MessPlan | null>(null);

  const plans = useQuery({
    queryKey: ['hostel', 'mess-plans', hostelFilter],
    queryFn: () => hostelService.listMessPlans(hostelFilter === ALL ? undefined : hostelFilter),
  });

  const planForm = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      hostelId: '',
      name: '',
      type: 'VEGETARIAN',
      monthlyCharge: 0,
      description: '',
      isActive: true,
    },
  });

  const subscribeForm = useForm<SubscribeFormValues>({
    resolver: zodResolver(subscribeFormSchema),
    defaultValues: { studentId: '', messPlanId: '', startDate: today(), endDate: '' },
  });

  useEffect(() => {
    if (!isPlanOpen) return;
    planForm.reset({
      hostelId: hostelFilter !== ALL ? hostelFilter : '',
      name: '',
      type: 'VEGETARIAN',
      monthlyCharge: 0,
      description: '',
      isActive: true,
    });
  }, [isPlanOpen, hostelFilter, planForm]);

  useEffect(() => {
    if (!subscribeTarget) return;
    subscribeForm.reset({
      studentId: '',
      messPlanId: subscribeTarget.id,
      startDate: today(),
      endDate: '',
    });
  }, [subscribeTarget, subscribeForm]);

  const createPlan = useMutation({
    mutationFn: (values: PlanFormValues) =>
      hostelService.createMessPlan({
        hostelId: values.hostelId,
        name: values.name,
        type: values.type,
        monthlyCharge: values.monthlyCharge,
        isActive: values.isActive,
        ...(values.description ? { description: values.description } : {}),
      }),
    onSuccess: async () => {
      toast.success('Mess plan created');
      await queryClient.invalidateQueries({ queryKey: ['hostel', 'mess-plans'] });
      setIsPlanOpen(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not create the plan');
    },
  });

  const subscribe = useMutation({
    mutationFn: (values: SubscribeFormValues) =>
      hostelService.subscribeMess({
        studentId: values.studentId,
        messPlanId: values.messPlanId,
        startDate: values.startDate,
        ...(values.endDate ? { endDate: values.endDate } : {}),
      }),
    onSuccess: async (subscription) => {
      toast.success(
        `${subscription.student.user.firstName} ${subscription.student.user.lastName} subscribed to ${subscription.messPlan.name}`,
      );
      await queryClient.invalidateQueries({ queryKey: ['hostel'] });
      setSubscribeTarget(null);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not subscribe the student');
    },
  });

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={hostelFilter} onValueChange={setHostelFilter}>
            <SelectTrigger className="w-[12rem]" aria-label="Filter by hostel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All hostels</SelectItem>
              {(hostels.data ?? []).map((hostel) => (
                <SelectItem key={hostel.id} value={hostel.id}>
                  {hostel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {can('HOSTEL', 'CREATE') && (
            <Button className="sm:ml-auto" onClick={() => setIsPlanOpen(true)}>
              <Plus className="size-4" aria-hidden />
              New mess plan
            </Button>
          )}
        </div>

        {plans.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : plans.error ? (
          <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
        ) : (plans.data ?? []).length === 0 ? (
          <EmptyState
            icon={UtensilsCrossed}
            title="No mess plans yet"
            description="Create a plan so residents can be subscribed and billed for meals."
            action={
              can('HOSTEL', 'CREATE') && (
                <Button onClick={() => setIsPlanOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  New mess plan
                </Button>
              )
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(plans.data ?? []).map((plan) => (
              <Card key={plan.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{plan.name}</CardTitle>
                      <CardDescription className="truncate">
                        {plan.hostel?.name ?? 'Hostel'}
                      </CardDescription>
                    </div>
                    <Badge variant={plan.isActive ? 'secondary' : 'outline'}>
                      {plan.isActive ? MESS_PLAN_TYPE_LABELS[plan.type] : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatCurrency(plan.monthlyCharge)}
                    <span className="text-muted-foreground ml-1 text-sm font-normal">/ month</span>
                  </p>

                  {plan.description && (
                    <p className="text-muted-foreground text-sm">{plan.description}</p>
                  )}

                  <p className="text-muted-foreground text-sm">
                    {plan._count?.subscriptions ?? 0} subscriber(s)
                  </p>

                  {can('HOSTEL', 'ASSIGN') && plan.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setSubscribeTarget(plan)}
                    >
                      <UserPlus className="size-4" aria-hidden />
                      Subscribe a student
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <FormDialog
        open={isPlanOpen}
        onOpenChange={setIsPlanOpen}
        title="New mess plan"
        description="Plans are priced per month and billed alongside hostel fees."
        formId={PLAN_FORM_ID}
        isSubmitting={planForm.formState.isSubmitting}
        submitLabel="Create plan"
      >
        <Form {...planForm}>
          <form
            id={PLAN_FORM_ID}
            className="space-y-5"
            noValidate
            onSubmit={planForm.handleSubmit(async (values) => {
              try {
                await createPlan.mutateAsync(values);
              } catch (error) {
                applyApiErrors(error, planForm.setError, [
                  'hostelId',
                  'name',
                  'type',
                  'monthlyCharge',
                  'description',
                  'isActive',
                ]);
              }
            })}
          >
            <FormField
              control={planForm.control}
              name="hostelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hostel</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a hostel" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(hostels.data ?? []).map((hostel) => (
                        <SelectItem key={hostel.id} value={hostel.id}>
                          {hostel.name} · {hostel.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={planForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Standard vegetarian" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={planForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PLAN_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {MESS_PLAN_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={planForm.control}
                name="monthlyCharge"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monthly charge</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="decimal" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={planForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="What the plan includes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={planForm.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4">
                  <div className="space-y-1">
                    <FormLabel>Available for subscription</FormLabel>
                    <FormDescription>
                      Inactive plans keep their history but accept no new subscribers.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>

      <FormDialog
        open={subscribeTarget !== null}
        onOpenChange={(open) => !open && setSubscribeTarget(null)}
        title="Subscribe a student"
        description={
          subscribeTarget
            ? `${subscribeTarget.name} — ${formatCurrency(subscribeTarget.monthlyCharge)} per month.`
            : undefined
        }
        formId={SUBSCRIBE_FORM_ID}
        isSubmitting={subscribeForm.formState.isSubmitting}
        submitLabel="Subscribe"
      >
        <Form {...subscribeForm}>
          <form
            id={SUBSCRIBE_FORM_ID}
            className="space-y-5"
            noValidate
            onSubmit={subscribeForm.handleSubmit(async (values) => {
              try {
                await subscribe.mutateAsync(values);
              } catch (error) {
                applyApiErrors(error, subscribeForm.setError, [
                  'studentId',
                  'messPlanId',
                  'startDate',
                  'endDate',
                ]);
              }
            })}
          >
            <FormField
              control={subscribeForm.control}
              name="studentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Student</FormLabel>
                  <FormControl>
                    <StudentPicker
                      value={field.value || null}
                      onChange={(id) => field.onChange(id ?? '')}
                    />
                  </FormControl>
                  <FormDescription>
                    Any existing plan for this student is closed automatically.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={subscribeForm.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>From</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={subscribeForm.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Until</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormDescription>Leave blank for open-ended.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </FormDialog>
    </>
  );
}
