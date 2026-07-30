'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/common/form-dialog';
import {
  Form,
  FormControl,
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
import { applyApiErrors } from '@/lib/form-errors';
import { academicService } from '@/services/academic.service';
import { studentService } from '@/services/student.service';

const NONE = '__none__';
const FORM_ID = 'transfer-student-form';

const formSchema = z.object({
  toClassId: z.string().uuid('Select the target class'),
  toSectionId: z.string().optional(),
  effectiveDate: z.string().min(1, 'Effective date is required'),
  remarks: z.string().trim().max(300).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface TransferStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  currentClassId: string | null;
}

export function TransferStudentDialog({
  open,
  onOpenChange,
  studentId,
  currentClassId,
}: TransferStudentDialogProps) {
  const queryClient = useQueryClient();

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
    enabled: open,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      toClassId: '',
      toSectionId: NONE,
      effectiveDate: new Date().toISOString().slice(0, 10),
      remarks: '',
    },
  });

  const selectedClassId = form.watch('toClassId');

  const sectionChoices = useMemo(
    () => classOptions.data?.find((option) => option.id === selectedClassId)?.sections ?? [],
    [classOptions.data, selectedClassId],
  );

  useEffect(() => {
    if (!open) return;
    form.reset({
      toClassId: currentClassId ?? '',
      toSectionId: NONE,
      effectiveDate: new Date().toISOString().slice(0, 10),
      remarks: '',
    });
  }, [open, form, currentClassId]);

  const transferMutation = useMutation({
    mutationFn: (values: FormValues) =>
      studentService.transfer(studentId, {
        toClassId: values.toClassId,
        toSectionId: values.toSectionId === NONE ? null : (values.toSectionId ?? null),
        effectiveDate: values.effectiveDate,
        ...(values.remarks ? { remarks: values.remarks } : {}),
      }),
    onSuccess: async () => {
      toast.success('Student transferred');
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      onOpenChange(false);
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await transferMutation.mutateAsync(values);
    } catch (error) {
      const message = applyApiErrors(error, form.setError, ['toClassId', 'toSectionId']);
      if (message) toast.error(message);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Transfer this student"
      description="Moves the student to another class or section within the same academic year."
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Transfer student"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="toClassId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target class</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    form.setValue('toSectionId', NONE);
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a class" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(classOptions.data ?? []).map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name} ({option.code})
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
            name="toSectionId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target section</FormLabel>
                <Select
                  value={field.value ?? NONE}
                  onValueChange={field.onChange}
                  disabled={!selectedClassId}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>Leave unassigned</SelectItem>
                    {sectionChoices.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.name}
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
            name="effectiveDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Effective date</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="remarks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Remarks</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} placeholder="Recorded on the student's timeline" />
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
