'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/common/form-dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { transportService } from '@/services/transport.service';
import type { TransportRoute } from '@/types/transport';

const FORM_ID = 'route-stops-form';

const stopsFormSchema = z
  .object({
    stops: z
      .array(
        z.object({
          name: z.string().trim().min(1, 'Stop name is required').max(160),
          pickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM'),
          dropTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM'),
          landmark: z.string().trim().max(160).optional(),
        }),
      )
      .min(1, 'Add at least one stop')
      .max(60),
  })
  .refine(
    (data) => {
      const names = data.stops.map((stop) => stop.name.trim().toLowerCase());
      return new Set(names).size === names.length;
    },
    { message: 'Two stops share the same name', path: ['stops'] },
  );

type StopsFormValues = z.infer<typeof stopsFormSchema>;

interface RouteStopsDialogProps {
  route: TransportRoute | null;
  onOpenChange: (open: boolean) => void;
}

const BLANK_STOP = { name: '', pickupTime: '07:30', dropTime: '15:30', landmark: '' };

/**
 * Editor for a route's ordered stop list.
 *
 * The whole list is replaced on save; the sequence comes from the array order,
 * so reordering here is what renumbers the stops.
 */
export function RouteStopsDialog({ route, onOpenChange }: RouteStopsDialogProps) {
  const queryClient = useQueryClient();
  const isOpen = route !== null;

  const form = useForm<StopsFormValues>({
    resolver: zodResolver(stopsFormSchema),
    defaultValues: { stops: [BLANK_STOP] },
  });

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'stops',
  });

  useEffect(() => {
    if (!isOpen || !route) return;
    form.reset({
      stops:
        route.stops.length > 0
          ? route.stops.map((stop) => ({
              name: stop.name,
              pickupTime: stop.pickupTime,
              dropTime: stop.dropTime,
              landmark: stop.landmark ?? '',
            }))
          : [BLANK_STOP],
    });
  }, [isOpen, route, form]);

  const mutation = useMutation({
    mutationFn: (values: StopsFormValues) => {
      if (!route) throw new Error('No route selected');
      return transportService.setRouteStops(route.id, {
        stops: values.stops.map((stop) => ({
          name: stop.name,
          pickupTime: stop.pickupTime,
          dropTime: stop.dropTime,
          ...(stop.landmark ? { landmark: stop.landmark } : {}),
        })),
      });
    },
    onSuccess: async (updated) => {
      toast.success(`${updated.stops.length} stop(s) saved on ${updated.name}`);
      await queryClient.invalidateQueries({ queryKey: ['transport'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not save the stops');
    },
  });

  const rootError = form.formState.errors.stops?.message;

  return (
    <FormDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title="Route stops"
      description={
        route
          ? `${route.name}: ${route.startPoint} → ${route.endPoint}. Stops are numbered in the order shown.`
          : undefined
      }
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Save stops"
      size="xl"
    >
      <Form {...form}>
        <form
          id={FORM_ID}
          className="space-y-4"
          noValidate
          onSubmit={form.handleSubmit(async (values) => {
            await mutation.mutateAsync(values).catch(() => undefined);
          })}
        >
          {rootError && <p className="text-destructive text-sm">{rootError}</p>}

          <ul className="space-y-3">
            {fields.map((field, index) => (
              <li key={field.id} className="rounded-lg border p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-sm font-medium">
                    Stop {index + 1}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Move stop ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Move stop ${index + 1} down`}
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive size-8"
                      aria-label={`Remove stop ${index + 1}`}
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <FormField
                    control={form.control}
                    name={`stops.${index}.name`}
                    render={({ field: nameField }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...nameField} placeholder="Market square" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`stops.${index}.pickupTime`}
                    render={({ field: pickupField }) => (
                      <FormItem>
                        <FormLabel>Pickup</FormLabel>
                        <FormControl>
                          <Input {...pickupField} type="time" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`stops.${index}.dropTime`}
                    render={({ field: dropField }) => (
                      <FormItem>
                        <FormLabel>Drop</FormLabel>
                        <FormControl>
                          <Input {...dropField} type="time" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`stops.${index}.landmark`}
                    render={({ field: landmarkField }) => (
                      <FormItem>
                        <FormLabel>Landmark</FormLabel>
                        <FormControl>
                          <Input {...landmarkField} placeholder="Optional" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={fields.length >= 60}
            onClick={() => append(BLANK_STOP)}
          >
            <Plus className="size-4" aria-hidden />
            Add a stop
          </Button>

          <p className="text-muted-foreground text-sm">
            A stop that still has riders assigned cannot be removed.
          </p>
        </form>
      </Form>
    </FormDialog>
  );
}
