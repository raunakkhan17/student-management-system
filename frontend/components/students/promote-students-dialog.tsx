'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/common/form-dialog';
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
import { academicService } from '@/services/academic.service';
import { studentService } from '@/services/student.service';

const NONE = '__none__';
const FORM_ID = 'promote-students-form';

const formSchema = z.object({
  toAcademicYearId: z.string().uuid('Select the target academic year'),
  toClassId: z.string().uuid('Select the target class'),
  toSectionId: z.string().optional(),
  effectiveDate: z.string().min(1, 'Effective date is required'),
  remarks: z.string().trim().max(300).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface PromoteStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentIds: string[];
  onPromoted: () => void;
}

/** Bulk-promotes the selected students into a new year and class. */
export function PromoteStudentsDialog({
  open,
  onOpenChange,
  studentIds,
  onPromoted,
}: PromoteStudentsDialogProps) {
  const years = useQuery({
    queryKey: ['academics', 'academic-years', 'all'],
    queryFn: () => academicService.listYears({ limit: 100, sortBy: 'startDate', sortOrder: 'desc' }),
    enabled: open,
  });

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
    enabled: open,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      toAcademicYearId: '',
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
      toAcademicYearId: '',
      toClassId: '',
      toSectionId: NONE,
      effectiveDate: new Date().toISOString().slice(0, 10),
      remarks: '',
    });
  }, [open, form]);

  const promoteMutation = useMutation({
    mutationFn: (values: FormValues) =>
      studentService.promote({
        studentIds,
        toAcademicYearId: values.toAcademicYearId,
        toClassId: values.toClassId,
        toSectionId: values.toSectionId === NONE ? null : (values.toSectionId ?? null),
        effectiveDate: values.effectiveDate,
        ...(values.remarks ? { remarks: values.remarks } : {}),
      }),
    onSuccess: (result) => {
      if (result.skipped.length > 0) {
        toast.warning(
          `Promoted ${result.promoted}; skipped ${result.skipped.length} (${result.skipped[0]?.reason ?? 'ineligible'})`,
        );
      } else {
        toast.success(`Promoted ${result.promoted} student${result.promoted === 1 ? '' : 's'}`);
      }
      onOpenChange(false);
      onPromoted();
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await promoteMutation.mutateAsync(values);
    } catch (error) {
      const message = applyApiErrors(error, form.setError, [
        'toAcademicYearId',
        'toClassId',
        'toSectionId',
      ]);
      if (message) toast.error(message);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Promote ${studentIds.length} student${studentIds.length === 1 ? '' : 's'}`}
      description="Only active students are promoted. Anything else is reported back as skipped."
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Promote students"
      size="lg"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {promoteMutation.error instanceof ApiError &&
            Object.keys(promoteMutation.error.fieldErrors).length === 0 && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden />
                <AlertDescription>{promoteMutation.error.message}</AlertDescription>
              </Alert>
            )}

          <FormField
            control={form.control}
            name="toAcademicYearId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target academic year</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select an academic year" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(years.data?.items ?? []).map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name}
                        {year.isCurrent ? ' (current)' : ''}
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
                  <FormDescription>Capacity is checked for the whole batch.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

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
                  <Textarea {...field} rows={2} placeholder="Recorded against each student's timeline" />
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
