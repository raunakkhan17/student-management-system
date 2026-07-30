'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/common/form-dialog';
import { StudentPicker } from '@/components/common/student-picker';
import { TeacherPicker } from '@/components/common/teacher-picker';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import { documentService } from '@/services/document.service';
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@/types/document';

const FORM_ID = 'upload-document-form';

const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[];

const uploadFormSchema = z
  .object({
    type: z.string().min(1, 'Choose a document type'),
    title: z.string().trim().min(1, 'Give the document a name').max(200),
    issuedDate: z.string().optional(),
    expiryDate: z.string().optional(),
    remarks: z.string().trim().max(1000).optional(),
    /** Owner choice and the file live in the form so one reset clears them. */
    ownerKind: z.enum(['student', 'teacher']),
    studentId: z.string().nullable(),
    teacherId: z.string().nullable(),
    file: z.custom<File>().nullable(),
  })
  .refine(
    (data) => !data.issuedDate || !data.expiryDate || data.expiryDate > data.issuedDate,
    { message: 'The expiry must be after the issue date', path: ['expiryDate'] },
  );

type UploadFormValues = z.infer<typeof uploadFormSchema>;

interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Locks the owner when opened from a student or teacher profile. */
  fixedStudentId?: string;
  fixedTeacherId?: string;
}

export function UploadDocumentDialog({
  open,
  onOpenChange,
  fixedStudentId,
  fixedTeacherId,
}: UploadDocumentDialogProps) {
  const { user, hasRole } = useAuth();
  const queryClient = useQueryClient();

  // A student or teacher uploading their own paperwork cannot pick an owner.
  const isSelfService = hasRole('STUDENT', 'TEACHER', 'PARENT');
  const ownerIsFixed = Boolean(fixedStudentId ?? fixedTeacherId);

  const emptyValues = (): UploadFormValues => ({
    type: 'IDENTITY_PROOF',
    title: '',
    issuedDate: '',
    expiryDate: '',
    remarks: '',
    ownerKind: fixedTeacherId ? 'teacher' : 'student',
    studentId: fixedStudentId ?? null,
    teacherId: fixedTeacherId ?? null,
    file: null,
  });

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: emptyValues(),
  });

  useEffect(() => {
    if (!open) return;
    form.reset(emptyValues());
    // `emptyValues` closes over the fixed ids, which are in the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedStudentId, fixedTeacherId, form]);

  const ownerKind = form.watch('ownerKind');
  const studentId = form.watch('studentId');
  const teacherId = form.watch('teacherId');
  const file = form.watch('file');

  const mutation = useMutation({
    mutationFn: async (values: UploadFormValues) => {
      if (!values.file) throw new Error('Choose a file');

      // A self-service upload always attaches to the caller's own profile.
      const owner = ownerIsFixed
        ? { studentId: fixedStudentId ?? null, teacherId: fixedTeacherId ?? null }
        : isSelfService
          ? {
              studentId: user?.studentProfile?.id ?? null,
              teacherId: user?.teacherProfile?.id ?? null,
            }
          : values.ownerKind === 'student'
            ? { studentId: values.studentId, teacherId: null }
            : { studentId: null, teacherId: values.teacherId };

      return documentService.upload(values.file, {
        type: values.type as DocumentType,
        title: values.title,
        ...owner,
        ...(values.issuedDate ? { issuedDate: values.issuedDate } : {}),
        ...(values.expiryDate ? { expiryDate: values.expiryDate } : {}),
        ...(values.remarks ? { remarks: values.remarks } : {}),
      });
    },
    onSuccess: async () => {
      toast.success('Document uploaded and sent for verification');
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not upload the document');
    },
  });

  const onSubmit = async (values: UploadFormValues) => {
    if (!values.file) {
      form.setError('file', { type: 'manual', message: 'Choose a file to upload' });
      return;
    }

    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'studentId',
        'teacherId',
        'type',
        'title',
        'issuedDate',
        'expiryDate',
        'remarks',
      ]);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload a document"
      description="Uploads start as awaiting review until an administrator verifies them."
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Upload document"
      size="lg"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {!ownerIsFixed && !isSelfService && (
            <div className="space-y-3">
              <Label>Belongs to</Label>

              <Tabs
                value={ownerKind}
                onValueChange={(value) => form.setValue('ownerKind', value as 'student' | 'teacher')}
              >
                <TabsList>
                  <TabsTrigger value="student">A student</TabsTrigger>
                  <TabsTrigger value="teacher">A member of staff</TabsTrigger>
                </TabsList>
              </Tabs>

              {ownerKind === 'student' ? (
                <StudentPicker
                  value={studentId}
                  onChange={(id) => form.setValue('studentId', id)}
                />
              ) : (
                <TeacherPicker
                  value={teacherId}
                  onChange={(id) => form.setValue('teacherId', id)}
                />
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="document-file">File</Label>
            <Input
              id="document-file"
              type="file"
              onChange={(event) => form.setValue('file', event.target.files?.[0] ?? null)}
            />
            {form.formState.errors.file && (
              <p className="text-destructive text-sm">{form.formState.errors.file.message}</p>
            )}
            {file && (
              <p className="text-muted-foreground text-sm">
                {file.name} ({Math.ceil(file.size / 1024)} KB)
              </p>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
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
                      {DOCUMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {DOCUMENT_TYPE_LABELS[type]}
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
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Aadhaar card" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="issuedDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Issued on</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expiryDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expires on</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormDescription>Warns 30 days ahead.</FormDescription>
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
                  <Textarea {...field} rows={2} placeholder="Optional note for the reviewer" />
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
