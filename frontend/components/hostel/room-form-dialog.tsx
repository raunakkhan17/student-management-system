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
import { useHostelOptions } from '@/hooks/use-hostel-options';
import { applyApiErrors } from '@/lib/form-errors';
import { hostelService } from '@/services/hostel.service';
import {
  ROOM_STATUS_LABELS,
  ROOM_TYPE_LABELS,
  type HostelRoom,
  type HostelRoomStatus,
  type HostelRoomType,
  type RoomPayload,
} from '@/types/hostel';

const FORM_ID = 'hostel-room-form';
const QUERY_KEY = ['hostel', 'rooms'] as const;

const ROOM_TYPES: HostelRoomType[] = ['SINGLE', 'DOUBLE', 'TRIPLE', 'DORMITORY'];
const ROOM_STATUSES: HostelRoomStatus[] = ['AVAILABLE', 'MAINTENANCE', 'RESERVED'];

const roomFormSchema = z.object({
  hostelId: z.string().uuid('Select a hostel'),
  roomNumber: z.string().trim().min(1, 'Room number is required').max(20),
  floor: z.string().trim().max(20).optional(),
  type: z.enum(['SINGLE', 'DOUBLE', 'TRIPLE', 'DORMITORY']),
  capacity: z.coerce.number().int().min(1, 'At least one bed').max(40),
  monthlyRent: z.coerce.number().nonnegative().max(999_999),
  status: z.enum(['AVAILABLE', 'PARTIALLY_OCCUPIED', 'FULL', 'MAINTENANCE', 'RESERVED']),
});

type RoomFormValues = z.infer<typeof roomFormSchema>;

interface RoomFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: HostelRoom | null;
  /** Pre-selects the hostel when the list is already filtered to one. */
  defaultHostelId?: string;
}

export function RoomFormDialog({
  open,
  onOpenChange,
  room,
  defaultHostelId,
}: RoomFormDialogProps) {
  const hostels = useHostelOptions(open);

  const { createMutation, updateMutation } = useCrudMutations<
    RoomPayload,
    Partial<Omit<RoomPayload, 'hostelId'>>,
    HostelRoom
  >({
    queryKey: QUERY_KEY,
    entityName: 'room',
    create: hostelService.createRoom,
    update: hostelService.updateRoom,
    onSuccess: () => onOpenChange(false),
  });

  const form = useForm<RoomFormValues>({
    resolver: zodResolver(roomFormSchema),
    defaultValues: {
      hostelId: '',
      roomNumber: '',
      floor: '',
      type: 'DOUBLE',
      capacity: 2,
      monthlyRent: 0,
      status: 'AVAILABLE',
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      room
        ? {
            hostelId: room.hostelId,
            roomNumber: room.roomNumber,
            floor: room.floor ?? '',
            type: room.type,
            capacity: room.capacity,
            monthlyRent: Number(room.monthlyRent),
            status: room.status,
          }
        : {
            hostelId: defaultHostelId ?? '',
            roomNumber: '',
            floor: '',
            type: 'DOUBLE',
            capacity: 2,
            monthlyRent: 0,
            status: 'AVAILABLE',
          },
    );
  }, [open, room, defaultHostelId, form]);

  const onSubmit = async (values: RoomFormValues) => {
    const payload: RoomPayload = {
      hostelId: values.hostelId,
      roomNumber: values.roomNumber,
      type: values.type,
      capacity: values.capacity,
      monthlyRent: values.monthlyRent,
      status: values.status,
      ...(values.floor ? { floor: values.floor } : {}),
    };

    try {
      if (room) {
        const { hostelId: _hostelId, ...rest } = payload;
        await updateMutation.mutateAsync({ id: room.id, payload: rest });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'hostelId',
        'roomNumber',
        'floor',
        'type',
        'capacity',
        'monthlyRent',
        'status',
      ]);
    }
  };

  // A room already holding students cannot be moved out of an occupancy state.
  const statusOptions: HostelRoomStatus[] =
    room && room.occupied > 0 ? [room.status, 'MAINTENANCE', 'RESERVED'] : ROOM_STATUSES;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={room ? `Edit room ${room.roomNumber}` : 'New room'}
      description={
        room
          ? 'Capacity cannot drop below the number of students already in the room.'
          : 'Add a single room. Use bulk creation for a whole floor.'
      }
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel={room ? 'Save changes' : 'Create room'}
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="hostelId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hostel</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={Boolean(room)}
                >
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
              name="roomNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Room number</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="101" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="floor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Floor</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ground" />
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
                  <FormLabel>Beds</FormLabel>
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
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {ROOM_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Occupancy states are recalculated from allocations; set Maintenance or Reserved to
                  hold a room out of use.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FormDialog>
  );
}
