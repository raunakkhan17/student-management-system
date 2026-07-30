'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Save, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FileDropzone } from '@/components/common/file-dropzone';
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
import { applyApiErrors } from '@/lib/form-errors';
import { academicService } from '@/services/academic.service';
import { assignmentService } from '@/services/assignment.service';

const formSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: z.string().trim().min(1, 'Description is required').max(5000),
    /** A subject offering — carries class, section, subject and teacher together. */
    offeringId: z.string().uuid('Select a subject offering'),
    assignedDate: z.string().min(1, 'Assigned date is required'),
    dueDate: z.string().min(1, 'Due date is required'),
    maxMarks: z.coerce.number().min(0).max(1000),
    allowLateSubmission: z.boolean(),
  })
  .refine((data) => new Date(data.dueDate) > new Date(data.assignedDate), {
    message: 'The due date must be after the assigned date',
    path: ['dueDate'],
  });

type FormValues = z.infer<typeof formSchema>;

/** Defaults the deadline to one week out at 23:59. */
function defaultDueDate(): string {
  const due = new Date(Date.now() + 7 * 86_400_000);
  due.setHours(23, 59, 0, 0);
  // datetime-local wants local time without a timezone suffix.
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(due.getHours())}:${pad(due.getMinutes())}`;
}

export function AssignmentForm() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);

  /** Offerings the signed-in teacher actually teaches. */
  const offeringsQuery = useQuery({
    queryKey: ['academics', 'offerings', 'mine'],
    queryFn: () => academicService.listOfferings({ limit: 100 }),
  });

  const offerings = offeringsQuery.data?.items ?? [];
  const offeringById = useMemo(
    () => new Map(offerings.map((offering) => [offering.id, offering])),
    [offerings],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      offeringId: '',
      assignedDate: new Date().toISOString().slice(0, 10),
      dueDate: defaultDueDate(),
      maxMarks: 20,
      allowLateSubmission: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: ({ values, publish }: { values: FormValues; publish: boolean }) => {
      const offering = offeringById.get(values.offeringId);
      if (!offering) throw new Error('Select a subject offering');

      return assignmentService.create(
        {
          title: values.title,
          description: values.description,
          classId: offering.classId,
          sectionId: offering.sectionId,
          subjectId: offering.subjectId,
          assignedDate: values.assignedDate,
          // datetime-local has no timezone; send it as an ISO instant.
          dueDate: new Date(values.dueDate).toISOString(),
          maxMarks: values.maxMarks,
          allowLateSubmission: values.allowLateSubmission,
          publish,
        },
        files,
      );
    },
    onSuccess: (assignment, { publish }) => {
      toast.success(publish ? 'Assignment published' : 'Saved as draft');
      router.push(`/assignments/${assignment.id}`);
    },
  });

  const submit = (publish: boolean) =>
    form.handleSubmit(async (values) => {
      try {
        await createMutation.mutateAsync({ values, publish });
      } catch (error) {
        const message = applyApiErrors(error, form.setError, [
          'title',
          'description',
          'maxMarks',
          'dueDate',
          'assignedDate',
        ]);
        if (message) toast.error(message);
      }
    })();

  const isBusy = createMutation.isPending || form.formState.isSubmitting;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New assignment"
        description="Publishing makes it visible to students immediately and creates a submission row for each of them."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Assignments', href: '/assignments' },
          { label: 'New' },
        ]}
      />

      <Form {...form}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(true);
          }}
          className="space-y-6"
          noValidate
        >
          {createMutation.error instanceof ApiError &&
            Object.keys(createMutation.error.fieldErrors).length === 0 && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden />
                <AlertTitle>Could not save the assignment</AlertTitle>
                <AlertDescription>{createMutation.error.message}</AlertDescription>
              </Alert>
            )}

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>
                The subject offering determines which class and section receive this work.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="offeringId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject offering</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a class and subject" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {offerings.map((offering) => (
                          <SelectItem key={offering.id} value={offering.id}>
                            {offering.subject.name} · {offering.class.name}
                            {offering.section ? ` — ${offering.section.name}` : ' (all sections)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {offerings.length === 0 && !offeringsQuery.isLoading && (
                      <FormDescription>
                        No subject offerings are assigned to you yet. An administrator assigns these
                        under Academic setup.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Chapter 4 — problem set" />
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
                    <FormLabel>Instructions</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={6}
                        placeholder="What students need to do, and how it will be marked"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Schedule &amp; marking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="assignedDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assigned date</FormLabel>
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
                      <FormLabel>Due</FormLabel>
                      <FormControl>
                        <Input {...field} type="datetime-local" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxMarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum marks</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={0} max={1000} step="0.5" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="allowLateSubmission"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-lg border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        id="allow-late"
                      />
                    </FormControl>
                    <div className="space-y-1">
                      <FormLabel htmlFor="allow-late" className="cursor-pointer">
                        Accept late submissions
                      </FormLabel>
                      <FormDescription>
                        Late work is accepted but flagged, so you can mark it down if you choose.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <FileDropzone
                files={files}
                onChange={setFiles}
                disabled={isBusy}
                label="Attachments"
                description="Worksheets or reference material, up to 10 files of 10 MB each"
              />
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/assignments')}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={() => void submit(false)} disabled={isBusy}>
              <Save className="size-4" aria-hidden />
              Save draft
            </Button>
            <Button type="submit" disabled={isBusy}>
              <Send className="size-4" aria-hidden />
              {isBusy ? 'Saving…' : 'Publish'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
