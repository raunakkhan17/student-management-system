'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { useHostelOptions } from '@/hooks/use-hostel-options';
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import { hostelService } from '@/services/hostel.service';
import { ROOM_TYPE_LABELS, type HostelRoomType } from '@/types/hostel';

const FORM_ID = 'bulk-rooms-form';
const ROOM_TYPES: HostelRoomType[] = ['SINGLE', 'DOUBLE', 'TRIPLE', 'DORMITORY'];

const bulkRoomsFormSchema = z
  .object({
    hostelId: z.string().uuid('Select a hostel'),
    floor: z.string().trim().max(20).optional(),
    prefix: z.string().trim().max(10).optional(),
    fromNumber: z.coerce.number().int().min(1).max(9999),
    toNumber: z.coerce.number().int().min(1).max(9999),
    type: z.enum(['SINGLE', 'DOUBLE', 'TRIPLE', 'DORMITORY']),
    capacity: z.coerce.number().int().min(1).max(40),
    monthlyRent: z.coerce.number().nonnegative().max(999_999),
  })
  .refine((data) => data.toNumber >= data.fromNumber, {
    message: 'The last room number must not be below the first',
    path: ['toNumber'],
  })
  .refine((data) => data.toNumber - data.fromNumber < 200, {
    message: 'Create at most 200 rooms at a time',
    path: ['toNumber'],
  });

type BulkRoomsFormValues = z.infer<typeof bulkRoomsFormSchema>;

const EMPTY: BulkRoomsFormValues = {
  hostelId: '',
  floor: '',
  prefix: '',
  fromNumber: 101,
  toNumber: 120,
  type: 'DOUBLE',
  capacity: 2,
  monthlyRent: 0,
};

interface BulkRoomsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultHostelId?: string;
}

/** Creates a numbered block of identical rooms, e.g. 101–120 on one floor. */
export function BulkRoomsDialog({ open, onOpenChange, defaultHostelId }: BulkRoomsDialogProps) {
  const queryClient = useQueryClient();
  const hostels = useHostelOptions(open);

  const form = useForm<BulkRoomsFormValues>({
    resolver: zodResolver(bulkRoomsFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset({ ...EMPTY, hostelId: defaultHostelId ?? '' });
  }, [open, defaultHostelId, form]);

  const mutation = useMutation({
    mutationFn: (values: BulkRoomsFormValues) =>
      hostelService.createRoomsInBulk({
        hostelId: values.hostelId,
        type: values.type,
        capacity: values.capacity,
        monthlyRent: values.monthlyRent,
        fromNumber: values.fromNumber,
        toNumber: values.toNumber,
        ...(values.floor ? { floor: values.floor } : {}),
        ...(values.prefix ? { prefix: values.prefix } : {}),
      }),
    onSuccess: async (result) => {
      toast.success(
        result.skipped.length === 0
          ? `${result.created} room(s) created`
          : `${result.created} room(s) created — ${result.skipped.length} already existed`,
      );
      await queryClient.invalidateQueries({ queryKey: ['hostel'] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not create the rooms');
    },
  });

  const onSubmit = async (values: BulkRoomsFormValues) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'hostelId',
        'floor',
        'prefix',
        'fromNumber',
        'toNumber',
        'type',
        'capacity',
        'monthlyRent',
      ]);
    }
  };

  const from = form.watch('fromNumber');
  const to = form.watch('toNumber');
  const prefix = form.watch('prefix');
  const count = Number.isFinite(to - from) && to >= from ? to - from + 1 : 0;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create a block of rooms"
      description="Rooms that already exist are skipped, so this is safe to re-run."
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel={count > 0 ? `Create ${count} room(s)` : 'Create rooms'}
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
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

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="floor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Floor</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="First" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="prefix"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number prefix</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="A-" />
                  </FormControl>
                  <FormDescription>
                    {prefix ? `Rooms will be named ${prefix}${from}…` : 'Optional, e.g. A- or G'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="fromNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First room</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={1} max={9999} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="toNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last room</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={1} max={9999} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
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
                      {ROOM_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {ROOM_TYPE_LABELS[type]}
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
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beds each</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={1} max={40} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="monthlyRent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monthly rent</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="decimal" />
                  </FormControl>
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
