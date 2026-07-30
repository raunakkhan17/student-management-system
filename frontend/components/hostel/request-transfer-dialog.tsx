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
import { hostelService } from '@/services/hostel.service';
import type { HostelAllocation } from '@/types/hostel';

const FORM_ID = 'room-transfer-form';

const transferFormSchema = z.object({
  toRoomId: z.string().uuid('Select the target room'),
  reason: z.string().trim().min(1, 'A reason is required').max(500),
  effectiveDate: z.string().optional(),
});

type TransferFormValues = z.infer<typeof transferFormSchema>;

interface RequestTransferDialogProps {
  allocation: HostelAllocation | null;
  onOpenChange: (open: boolean) => void;
}

/** Raises a transfer request; a warden approves it before the move happens. */
export function RequestTransferDialog({ allocation, onOpenChange }: RequestTransferDialogProps) {
  const queryClient = useQueryClient();
  const isOpen = allocation !== null;

  // Only rooms with a spare bed are worth offering as a destination.
  const rooms = useQuery({
    queryKey: ['hostel', 'rooms', 'transfer-targets'],
    queryFn: () => hostelService.listRooms({ limit: 100, onlyAvailable: true, sortBy: 'roomNumber' }),
    select: (page) => page.items.filter((room) => room.id !== allocation?.roomId),
    enabled: isOpen,
  });

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: { toRoomId: '', reason: '', effectiveDate: '' },
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset({ toRoomId: '', reason: '', effectiveDate: '' });
  }, [isOpen, form]);

  const mutation = useMutation({
    mutationFn: (values: TransferFormValues) => {
      if (!allocation) throw new Error('No allocation selected');
      return hostelService.requestTransfer({
        studentId: allocation.studentId,
        toRoomId: values.toRoomId,
        reason: values.reason,
        ...(values.effectiveDate ? { effectiveDate: values.effectiveDate } : {}),
      });
    },
    onSuccess: async () => {
      toast.success('Transfer request submitted for approval');
      await queryClient.invalidateQueries({ queryKey: ['hostel'] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not submit the request');
    },
  });

  const onSubmit = async (values: TransferFormValues) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, ['toRoomId', 'reason', 'effectiveDate']);
    }
  };

  return (
    <FormDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title="Request a room transfer"
      description={
        allocation
          ? `${allocation.student.user.firstName} ${allocation.student.user.lastName} is currently in room ${allocation.room.roomNumber}, ${allocation.room.hostel.name}.`
          : undefined
      }
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Submit request"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="toRoomId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Move to</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a room with a free bed" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(rooms.data ?? []).map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.hostel.name} · {room.roomNumber} ({room.capacity - room.occupied} free)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Capacity is re-checked at approval, in case the room fills up meanwhile.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="effectiveDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Effective from</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormDescription>Leave blank to move on the approval date.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reason</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} placeholder="Why is the transfer needed?" />
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
