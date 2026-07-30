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
import { Textarea } from '@/components/ui/textarea';
import { useCrudMutations } from '@/hooks/use-crud-mutations';
import { applyApiErrors } from '@/lib/form-errors';
import { hostelService } from '@/services/hostel.service';
import { teacherService } from '@/services/teacher.service';
import { HOSTEL_TYPE_LABELS, type Hostel, type HostelPayload, type HostelType } from '@/types/hostel';

const NONE = '__none__';
const FORM_ID = 'hostel-form';
const QUERY_KEY = ['hostel', 'list'] as const;

const TYPES: HostelType[] = ['BOYS', 'GIRLS', 'MIXED'];

const hostelFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and dashes only'),
  type: z.enum(['BOYS', 'GIRLS', 'MIXED']),
  wardenId: z.string().optional(),
  contactPhone: z.string().trim().optional(),
  address: z.string().trim().max(300).optional(),
  description: z.string().trim().max(500).optional(),
});

type HostelFormValues = z.infer<typeof hostelFormSchema>;

const EMPTY: HostelFormValues = {
  name: '',
  code: '',
  type: 'BOYS',
  wardenId: NONE,
  contactPhone: '',
  address: '',
  description: '',
};

interface HostelFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostel: Hostel | null;
}

export function HostelFormDialog({ open, onOpenChange, hostel }: HostelFormDialogProps) {
  const teachers = useQuery({
    queryKey: ['teachers', 'options'],
    queryFn: () => teacherService.listOptions(),
    enabled: open,
  });

  const { createMutation, updateMutation } = useCrudMutations<
    HostelPayload,
    Partial<HostelPayload>,
    Hostel
  >({
    queryKey: QUERY_KEY,
    entityName: 'hostel',
    create: hostelService.create,
    update: hostelService.update,
    onSuccess: () => onOpenChange(false),
  });

  const form = useForm<HostelFormValues>({
    resolver: zodResolver(hostelFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      hostel
        ? {
            name: hostel.name,
            code: hostel.code,
            type: hostel.type,
            wardenId: hostel.wardenId ?? NONE,
            contactPhone: hostel.contactPhone ?? '',
            address: hostel.address ?? '',
            description: hostel.description ?? '',
          }
        : EMPTY,
    );
  }, [open, hostel, form]);

  const onSubmit = async (values: HostelFormValues) => {
    const payload: HostelPayload = {
      name: values.name,
      code: values.code.toUpperCase(),
      type: values.type,
      wardenId: values.wardenId === NONE ? null : (values.wardenId ?? null),
      ...(values.contactPhone ? { contactPhone: values.contactPhone } : {}),
      ...(values.address ? { address: values.address } : {}),
      ...(values.description ? { description: values.description } : {}),
    };

    try {
      if (hostel) {
        await updateMutation.mutateAsync({ id: hostel.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'name',
        'code',
        'type',
        'wardenId',
        'contactPhone',
        'address',
        'description',
      ]);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={hostel ? 'Edit hostel' : 'New hostel'}
      description={
        hostel
          ? 'Update the hostel details.'
          : 'Register a hostel block, then add its rooms.'
      }
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel={hostel ? 'Save changes' : 'Create hostel'}
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Aryabhata Block" autoFocus />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="AB-1"
                      className="uppercase"
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
                          {HOSTEL_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Determines which students may be allocated here.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="wardenId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Warden</FormLabel>
                  <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Not assigned" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Not assigned</SelectItem>
                      {(teachers.data ?? []).map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.user.firstName} {teacher.user.lastName} · {teacher.employeeId}
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
              name="contactPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact number</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="+91 98765 43210" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} placeholder="Optional" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} placeholder="Optional" />
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
