'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import { transportService } from '@/services/transport.service';
import {
  MAINTENANCE_TYPE_LABELS,
  type MaintenanceType,
  type Vehicle,
} from '@/types/transport';

const FORM_ID = 'maintenance-form';

const TYPES: MaintenanceType[] = [
  'ROUTINE_SERVICE',
  'REPAIR',
  'TYRE_CHANGE',
  'INSURANCE_RENEWAL',
  'FITNESS_RENEWAL',
  'POLLUTION_CHECK',
  'OTHER',
];

/** Renewals also push the matching expiry date on the vehicle. */
const RENEWAL_TYPES: MaintenanceType[] = [
  'INSURANCE_RENEWAL',
  'FITNESS_RENEWAL',
  'POLLUTION_CHECK',
];

const maintenanceFormSchema = z.object({
  vehicleId: z.string().uuid('Select a vehicle'),
  type: z.enum([
    'ROUTINE_SERVICE',
    'REPAIR',
    'TYRE_CHANGE',
    'INSURANCE_RENEWAL',
    'FITNESS_RENEWAL',
    'POLLUTION_CHECK',
    'OTHER',
  ]),
  description: z.string().trim().min(1, 'Describe the work done').max(1000),
  serviceDate: z.string().min(1, 'Choose the service date'),
  nextServiceDate: z.string().optional(),
  cost: z.coerce.number().nonnegative().max(9_999_999),
  vendor: z.string().trim().max(160).optional(),
  odometerReading: z.string().trim().optional(),
});

type MaintenanceFormValues = z.infer<typeof maintenanceFormSchema>;

interface MaintenanceFormDialogProps {
  /** Pre-selects a vehicle; pass null with `open` to choose one in the form. */
  vehicle: Vehicle | null;
  onOpenChange: (open: boolean) => void;
  /** Set when the dialog is opened without a specific vehicle. */
  open?: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MaintenanceFormDialog({
  vehicle,
  onOpenChange,
  open,
}: MaintenanceFormDialogProps) {
  const queryClient = useQueryClient();
  const isOpen = open ?? vehicle !== null;

  const vehicles = useQuery({
    queryKey: ['transport', 'vehicles', 'options'],
    queryFn: () => transportService.listVehicleOptions(),
    enabled: isOpen && vehicle === null,
  });

  const form = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceFormSchema),
    defaultValues: {
      vehicleId: '',
      type: 'ROUTINE_SERVICE',
      description: '',
      serviceDate: today(),
      nextServiceDate: '',
      cost: 0,
      vendor: '',
      odometerReading: '',
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset({
      vehicleId: vehicle?.id ?? '',
      type: 'ROUTINE_SERVICE',
      description: '',
      serviceDate: today(),
      nextServiceDate: '',
      cost: 0,
      vendor: '',
      odometerReading: '',
    });
  }, [isOpen, vehicle, form]);

  const mutation = useMutation({
    mutationFn: (values: MaintenanceFormValues) => {
      const odometer = values.odometerReading?.trim()
        ? Number(values.odometerReading)
        : undefined;

      return transportService.logMaintenance({
        vehicleId: values.vehicleId,
        type: values.type,
        description: values.description,
        serviceDate: values.serviceDate,
        cost: values.cost,
        ...(values.nextServiceDate ? { nextServiceDate: values.nextServiceDate } : {}),
        ...(values.vendor ? { vendor: values.vendor } : {}),
        ...(odometer !== undefined && Number.isFinite(odometer)
          ? { odometerReading: odometer }
          : {}),
      });
    },
    onSuccess: async (record) => {
      toast.success(`Logged for ${record.vehicle.registrationNumber}`);
      await queryClient.invalidateQueries({ queryKey: ['transport'] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not log the maintenance');
    },
  });

  const onSubmit = async (values: MaintenanceFormValues) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'vehicleId',
        'type',
        'description',
        'serviceDate',
        'nextServiceDate',
        'cost',
        'vendor',
        'odometerReading',
      ]);
    }
  };

  const type = form.watch('type');
  const isRenewal = RENEWAL_TYPES.includes(type);

  return (
    <FormDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title="Log maintenance"
      description={
        vehicle
          ? `${vehicle.registrationNumber} — ${vehicle.make} ${vehicle.model}.`
          : 'Record servicing, repairs and statutory renewals.'
      }
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Log maintenance"
      size="lg"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {vehicle === null && (
            <FormField
              control={form.control}
              name="vehicleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vehicle</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a vehicle" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(vehicles.data ?? []).map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.registrationNumber} · {option.make} {option.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
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
                      {TYPES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {MAINTENANCE_TYPE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cost</FormLabel>
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
              name="serviceDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service date</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nextServiceDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isRenewal ? 'Valid until' : 'Next service due'}</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormDescription>
                    {isRenewal
                      ? "Updates the vehicle's expiry date for this document."
                      : 'Optional reminder date.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="vendor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Workshop or agency" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="odometerReading"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Odometer (km)</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="numeric" placeholder="84250" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Work done</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} placeholder="What was serviced or replaced" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FormDialog>
  );
}
