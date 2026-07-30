'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, FileStack } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader } from '@/components/common/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { formatCurrency } from '@/lib/format';
import { applyApiErrors } from '@/lib/form-errors';
import { academicService } from '@/services/academic.service';
import { feeService } from '@/services/fee.service';

const NONE = '__none__';

const formSchema = z
  .object({
    feeStructureId: z.string().uuid('Select a fee structure'),
    academicYearId: z.string().uuid('Select an academic year'),
    classId: z.string().uuid('Select a class'),
    sectionId: z.string().optional(),
    issueDate: z.string().min(1, 'Issue date is required'),
    dueDate: z.string().min(1, 'Due date is required'),
    installmentCount: z.coerce.number().int().min(1).max(12),
    applyConcessions: z.boolean(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((data) => new Date(data.dueDate) >= new Date(data.issueDate), {
    message: 'The due date cannot be before the issue date',
    path: ['dueDate'],
  });

type FormValues = z.infer<typeof formSchema>;

/** Issues one invoice per active student in a class (PRD Module 10 — Invoices). */
export function BulkInvoiceForm() {
  const router = useRouter();

  const years = useQuery({
    queryKey: ['academics', 'academic-years', 'all'],
    queryFn: () => academicService.listYears({ limit: 100, sortBy: 'startDate', sortOrder: 'desc' }),
  });

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
  });

  const structures = useQuery({
    queryKey: ['fees', 'structures', 'all'],
    queryFn: () => feeService.listStructures({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
  });

  const currentYearId = years.data?.items.find((year) => year.isCurrent)?.id ?? '';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      feeStructureId: '',
      academicYearId: '',
      classId: '',
      sectionId: NONE,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      installmentCount: 1,
      applyConcessions: true,
      notes: '',
    },
  });

  useEffect(() => {
    if (currentYearId && !form.getValues('academicYearId')) {
      form.setValue('academicYearId', currentYearId);
    }
  }, [currentYearId, form]);

  const selectedClassId = form.watch('classId');
  const selectedStructureId = form.watch('feeStructureId');
  const installmentCount = form.watch('installmentCount');

  const sectionChoices = useMemo(
    () => classOptions.data?.find((option) => option.id === selectedClassId)?.sections ?? [],
    [classOptions.data, selectedClassId],
  );

  const selectedStructure = useMemo(
    () => structures.data?.items.find((item) => item.id === selectedStructureId),
    [structures.data, selectedStructureId],
  );

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      feeService.createBulkInvoices({
        feeStructureId: values.feeStructureId,
        academicYearId: values.academicYearId,
        classId: values.classId,
        sectionId: values.sectionId === NONE ? null : (values.sectionId ?? null),
        issueDate: values.issueDate,
        dueDate: values.dueDate,
        installmentCount: values.installmentCount,
        applyConcessions: values.applyConcessions,
        ...(values.notes ? { notes: values.notes } : {}),
      }),
    onSuccess: (result) => {
      if (result.skipped.length > 0) {
        toast.warning(
          `Issued ${result.created}; skipped ${result.skipped.length} (${result.skipped[0]?.reason ?? 'ineligible'})`,
        );
      } else {
        toast.success(`Issued ${result.created} invoice(s)`);
      }
      router.push('/fees');
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await createMutation.mutateAsync(values);
    } catch (error) {
      const message = applyApiErrors(error, form.setError, [
        'feeStructureId',
        'academicYearId',
        'classId',
        'sectionId',
        'issueDate',
        'dueDate',
      ]);
      if (message) toast.error(message);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Issue invoices"
        description="Bills every active student in a class from a fee structure. Students already invoiced for that structure are skipped."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Fees', href: '/fees' },
          { label: 'Issue invoices' },
        ]}
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          {createMutation.error instanceof ApiError &&
            Object.keys(createMutation.error.fieldErrors).length === 0 && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden />
                <AlertTitle>Could not issue the invoices</AlertTitle>
                <AlertDescription>{createMutation.error.message}</AlertDescription>
              </Alert>
            )}

          <Card>
            <CardHeader>
              <CardTitle>What to bill</CardTitle>
              <CardDescription>
                Optional lines in a structure are excluded from automatic billing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="feeStructureId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fee structure</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a fee structure" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(structures.data?.items ?? [])
                          .filter((structure) => structure.isActive)
                          .map((structure) => (
                            <SelectItem key={structure.id} value={structure.id}>
                              {structure.name} · {formatCurrency(structure.totalAmount)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {selectedStructure && (
                      <FormDescription>
                        {selectedStructure.items.filter((item) => !item.isOptional).length}{' '}
                        mandatory line(s) totalling{' '}
                        {formatCurrency(
                          selectedStructure.items
                            .filter((item) => !item.isOptional)
                            .reduce((sum, item) => sum + Number(item.amount), 0),
                        )}
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="classId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Class</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue('sectionId', NONE);
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
                  name="sectionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Section</FormLabel>
                      <Select
                        value={field.value ?? NONE}
                        onValueChange={field.onChange}
                        disabled={!selectedClassId}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Whole class" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>Whole class</SelectItem>
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
                  name="academicYearId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Academic year</FormLabel>
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

                <FormField
                  control={form.control}
                  name="installmentCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Installments</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={1} max={12} />
                      </FormControl>
                      <FormDescription>
                        {installmentCount > 1
                          ? `Split monthly from the due date; rounding lands on the first installment.`
                          : 'Billed as a single amount.'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dates &amp; concessions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="issueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Issue date</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due date</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="applyConcessions"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-lg border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        id="apply-concessions"
                      />
                    </FormControl>
                    <div className="space-y-1">
                      <FormLabel htmlFor="apply-concessions" className="cursor-pointer">
                        Apply each student&apos;s scholarships and discounts
                      </FormLabel>
                      <FormDescription>
                        Concessions are deducted from the subtotal, and together can never exceed it.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} placeholder="Printed on every invoice" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/fees')}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              <FileStack className="size-4" aria-hidden />
              {form.formState.isSubmitting ? 'Issuing…' : 'Issue invoices'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
