'use client';

import { zodResolver } from '@hookform/resolvers/zod';
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
import { useCrudMutations } from '@/hooks/use-crud-mutations';
import { applyApiErrors } from '@/lib/form-errors';
import { transportService } from '@/services/transport.service';
import {
  VEHICLE_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  type Vehicle,
  type VehiclePayload,
  type VehicleStatus,
  type VehicleType,
} from '@/types/transport';

const FORM_ID = 'vehicle-form';
const QUERY_KEY = ['transport', 'vehicles'] as const;

const TYPES: VehicleType[] = ['BUS', 'MINI_BUS', 'VAN', 'CAR'];
const STATUSES: VehicleStatus[] = ['ACTIVE', 'MAINTENANCE', 'INACTIVE', 'RETIRED'];

const vehicleFormSchema = z.object({
  registrationNumber: z
    .string()
    .trim()
    .min(4, 'Enter a valid registration number')
    .max(20)
    .regex(/^[A-Za-z0-9- ]+$/, 'Letters, numbers, spaces and dashes only'),
  make: z.string().trim().min(1, 'Make is required').max(80),
  model: z.string().trim().min(1, 'Model is required').max(80),
  type: z.enum(['BUS', 'MINI_BUS', 'VAN', 'CAR']),
  capacity: z.coerce.number().int().min(1, 'At least one seat').max(120),
  manufactureYear: z.string().trim().optional(),
  insuranceExpiry: z.string().optional(),
  fitnessExpiry: z.string().optional(),
  pollutionExpiry: z.string().optional(),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'INACTIVE', 'RETIRED']),
});

type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

const EMPTY: VehicleFormValues = {
  registrationNumber: '',
  make: '',
  model: '',
  type: 'BUS',
  capacity: 40,
  manufactureYear: '',
  insuranceExpiry: '',
  fitnessExpiry: '',
  pollutionExpiry: '',
  status: 'ACTIVE',
};

interface VehicleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle | null;
}

export function VehicleFormDialog({ open, onOpenChange, vehicle }: VehicleFormDialogProps) {
  const { createMutation, updateMutation } = useCrudMutations<
    VehiclePayload,
    Partial<VehiclePayload>,
    Vehicle
  >({
    queryKey: QUERY_KEY,
    entityName: 'vehicle',
    create: transportService.createVehicle,
    update: transportService.updateVehicle,
    onSuccess: () => onOpenChange(false),
  });

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      vehicle
        ? {
            registrationNumber: vehicle.registrationNumber,
            make: vehicle.make,
            model: vehicle.model,
            type: vehicle.type,
            capacity: vehicle.capacity,
            manufactureYear: vehicle.manufactureYear ? String(vehicle.manufactureYear) : '',
            insuranceExpiry: vehicle.insuranceExpiry?.slice(0, 10) ?? '',
            fitnessExpiry: vehicle.fitnessExpiry?.slice(0, 10) ?? '',
            pollutionExpiry: vehicle.pollutionExpiry?.slice(0, 10) ?? '',
            status: vehicle.status,
          }
        : EMPTY,
    );
  }, [open, vehicle, form]);

  const onSubmit = async (values: VehicleFormValues) => {
    const year = values.manufactureYear?.trim() ? Number(values.manufactureYear) : undefined;

    const payload: VehiclePayload = {
      registrationNumber: values.registrationNumber.toUpperCase(),
      make: values.make,
      model: values.model,
      type: values.type,
      capacity: values.capacity,
      status: values.status,
      ...(year !== undefined && Number.isFinite(year) ? { manufactureYear: year } : {}),
      ...(values.insuranceExpiry ? { insuranceExpiry: values.insuranceExpiry } : {}),
      ...(values.fitnessExpiry ? { fitnessExpiry: values.fitnessExpiry } : {}),
      ...(values.pollutionExpiry ? { pollutionExpiry: values.pollutionExpiry } : {}),
    };

    try {
      if (vehicle) {
        await updateMutation.mutateAsync({ id: vehicle.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'registrationNumber',
        'make',
        'model',
        'type',
        'capacity',
        'manufactureYear',
        'insuranceExpiry',
        'fitnessExpiry',
        'pollutionExpiry',
        'status',
      ]);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={vehicle ? `Edit ${vehicle.registrationNumber}` : 'Register a vehicle'}
      description={
        vehicle
          ? 'Capacity cannot drop below the number of students already allocated.'
          : 'Statutory document dates drive the expiry warnings on the dashboard.'
      }
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel={vehicle ? 'Save changes' : 'Register vehicle'}
      size="lg"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="registrationNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Registration number</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="KA 01 AB 1234"
                      className="uppercase"
                      autoFocus
                      onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                      {TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {VEHICLE_TYPE_LABELS[type]}
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
              name="make"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Make</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Tata" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Starbus" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Seats</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={1} max={120} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="manufactureYear"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Year</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="numeric" placeholder="2021" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {VEHICLE_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="insuranceExpiry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Insurance until</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fitnessExpiry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fitness until</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pollutionExpiry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pollution until</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormDescription>Warns 30 days ahead.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </form>
      </Form>
    </FormDialog>
  );
}
