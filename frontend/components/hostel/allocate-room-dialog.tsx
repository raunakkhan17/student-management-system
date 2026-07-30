'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/common/form-dialog';
import { StudentPicker } from '@/components/common/student-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import { formatCurrency } from '@/lib/format';
import { hostelService } from '@/services/hostel.service';
import { HOSTEL_TYPE_LABELS, type HostelRoom } from '@/types/hostel';

const FORM_ID = 'allocate-room-form';

const allocateFormSchema = z.object({
  studentId: z.string().uuid('Select a student'),
  bedNumber: z.string().trim().max(10).optional(),
  allocatedFrom: z.string().min(1, 'Choose a start date'),
  remarks: z.string().trim().max(300).optional(),
});

type AllocateFormValues = z.infer<typeof allocateFormSchema>;

interface AllocateRoomDialogProps {
  room: HostelRoom | null;
  onOpenChange: (open: boolean) => void;
}

/** Today in the browser's timezone, formatted for a date input. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AllocateRoomDialog({ room, onOpenChange }: AllocateRoomDialogProps) {
  const queryClient = useQueryClient();
  const isOpen = room !== null;

  const form = useForm<AllocateFormValues>({
    resolver: zodResolver(allocateFormSchema),
    defaultValues: { studentId: '', bedNumber: '', allocatedFrom: today(), remarks: '' },
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset({ studentId: '', bedNumber: '', allocatedFrom: today(), remarks: '' });
  }, [isOpen, form]);

  const mutation = useMutation({
    mutationFn: (values: AllocateFormValues) => {
      if (!room) throw new Error('No room selected');
      return hostelService.allocateRoom({
        roomId: room.id,
        studentId: values.studentId,
        allocatedFrom: values.allocatedFrom,
        ...(values.bedNumber ? { bedNumber: values.bedNumber } : {}),
        ...(values.remarks ? { remarks: values.remarks } : {}),
      });
    },
    onSuccess: async (allocation) => {
      toast.success(
        `${allocation.student.user.firstName} ${allocation.student.user.lastName} allocated to room ${allocation.room.roomNumber}`,
      );
      await queryClient.invalidateQueries({ queryKey: ['hostel'] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not allocate the room');
    },
  });

  const onSubmit = async (values: AllocateFormValues) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, ['studentId', 'bedNumber', 'allocatedFrom', 'remarks']);
    }
  };

  const freeBeds = room ? room.capacity - room.occupied : 0;

  return (
    <FormDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title="Allocate a bed"
      description={
        room
          ? `Room ${room.roomNumber} in ${room.hostel.name} — ${freeBeds} of ${room.capacity} bed(s) free, ${formatCurrency(room.monthlyRent)} per month.`
          : undefined
      }
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Allocate bed"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {room && room.hostel.type !== 'MIXED' && (
            <Alert>
              <AlertDescription>
                This is a {HOSTEL_TYPE_LABELS[room.hostel.type].toLowerCase()} hostel, so only
                matching students can be allocated here.
              </AlertDescription>
            </Alert>
          )}

          <FormField
            control={form.control}
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
                  A student can hold only one hostel bed at a time.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="allocatedFrom"
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
              control={form.control}
              name="bedNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bed</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="B2" />
                  </FormControl>
                  <FormDescription>Optional label within the room.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="remarks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Remarks</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} placeholder="Optional note" />
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
