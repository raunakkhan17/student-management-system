'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormDialog } from '@/components/common/form-dialog';
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
import { Switch } from '@/components/ui/switch';
import { useCrudMutations } from '@/hooks/use-crud-mutations';
import { applyApiErrors } from '@/lib/form-errors';
import { transportService } from '@/services/transport.service';
import type { RoutePayload, TransportRoute } from '@/types/transport';

const NONE = '__none__';
const FORM_ID = 'transport-route-form';
const QUERY_KEY = ['transport', 'routes'] as const;

const routeFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and dashes only'),
  startPoint: z.string().trim().min(1, 'Start point is required').max(160),
  endPoint: z.string().trim().min(1, 'End point is required').max(160),
  distanceKm: z.string().trim().optional(),
  estimatedMins: z.string().trim().optional(),
  fare: z.coerce.number().nonnegative().max(999_999),
  vehicleId: z.string().optional(),
  driverId: z.string().optional(),
  attendantName: z.string().trim().max(160).optional(),
  attendantPhone: z.string().trim().max(20).optional(),
  isActive: z.boolean(),
});

type RouteFormValues = z.infer<typeof routeFormSchema>;

const EMPTY: RouteFormValues = {
  name: '',
  code: '',
  startPoint: '',
  endPoint: '',
  distanceKm: '',
  estimatedMins: '',
  fare: 0,
  vehicleId: NONE,
  driverId: NONE,
  attendantName: '',
  attendantPhone: '',
  isActive: true,
};

interface RouteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route: TransportRoute | null;
}

function toNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function RouteFormDialog({ open, onOpenChange, route }: RouteFormDialogProps) {
  const vehicles = useQuery({
    queryKey: ['transport', 'vehicles', 'options'],
    queryFn: () => transportService.listVehicleOptions(),
    enabled: open,
  });

  const drivers = useQuery({
    queryKey: ['transport', 'drivers', 'options'],
    queryFn: () => transportService.listDriverOptions(),
    enabled: open,
  });

  const { createMutation, updateMutation } = useCrudMutations<
    RoutePayload,
    Partial<RoutePayload>,
    TransportRoute
  >({
    queryKey: QUERY_KEY,
    entityName: 'route',
    create: transportService.createRoute,
    update: transportService.updateRoute,
    onSuccess: () => onOpenChange(false),
  });

  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      route
        ? {
            name: route.name,
            code: route.code,
            startPoint: route.startPoint,
            endPoint: route.endPoint,
            distanceKm: route.distanceKm ?? '',
            estimatedMins: route.estimatedMins ? String(route.estimatedMins) : '',
            fare: Number(route.fare),
            vehicleId: route.vehicleId ?? NONE,
            driverId: route.driverId ?? NONE,
            attendantName: route.attendantName ?? '',
            attendantPhone: route.attendantPhone ?? '',
            isActive: route.isActive,
          }
        : EMPTY,
    );
  }, [open, route, form]);

  const onSubmit = async (values: RouteFormValues) => {
    const distanceKm = toNumber(values.distanceKm);
    const estimatedMins = toNumber(values.estimatedMins);

    const payload: RoutePayload = {
      name: values.name,
      code: values.code.toUpperCase(),
      startPoint: values.startPoint,
      endPoint: values.endPoint,
      fare: values.fare,
      vehicleId: values.vehicleId === NONE ? null : (values.vehicleId ?? null),
      driverId: values.driverId === NONE ? null : (values.driverId ?? null),
      isActive: values.isActive,
      ...(distanceKm !== undefined ? { distanceKm } : {}),
      ...(estimatedMins !== undefined ? { estimatedMins } : {}),
      ...(values.attendantName ? { attendantName: values.attendantName } : {}),
      ...(values.attendantPhone ? { attendantPhone: values.attendantPhone } : {}),
    };

    try {
      if (route) {
        await updateMutation.mutateAsync({ id: route.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'name',
        'code',
        'startPoint',
        'endPoint',
        'distanceKm',
        'estimatedMins',
        'fare',
        'vehicleId',
        'driverId',
        'attendantName',
        'attendantPhone',
        'isActive',
      ]);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={route ? `Edit ${route.name}` : 'New route'}
      description="A vehicle and a driver can each serve only one active route at a time."
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel={route ? 'Save changes' : 'Create route'}
      size="lg"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="North corridor" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="R-01"
                      className="uppercase"
                      onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="startPoint"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start point</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Campus gate" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endPoint"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End point</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Railway station" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="distanceKm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Distance (km)</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="decimal" placeholder="12.5" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimatedMins"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (min)</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="numeric" placeholder="45" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fare"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Standard fare</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="decimal" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="vehicleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vehicle</FormLabel>
                  <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Not assigned" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Not assigned</SelectItem>
                      {(vehicles.data ?? []).map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.registrationNumber} · {vehicle.capacity} seats
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Vehicle capacity caps the rider list.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="driverId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Driver</FormLabel>
                  <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Not assigned" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Not assigned</SelectItem>
                      {(drivers.data ?? []).map((driver) => (
                        <SelectItem key={driver.id} value={driver.id}>
                          {driver.firstName} {driver.lastName} · {driver.employeeCode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="attendantName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Attendant</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Optional" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="attendantPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Attendant phone</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Optional" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between gap-4">
                <div className="space-y-1">
                  <FormLabel>Route is running</FormLabel>
                  <FormDescription>
                    Only active routes accept new student allocations.
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
  );
}
