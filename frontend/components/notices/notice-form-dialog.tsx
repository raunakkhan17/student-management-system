'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/common/form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Label } from '@/components/ui/label';
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
import { noticeService } from '@/services/notice.service';
import { ROLE_LABELS, UserRole } from '@/types/enums';
import { PRIORITY_LABELS, type Priority } from '@/types/hostel';
import {
  NOTICE_CATEGORY_LABELS,
  type AudienceRulePayload,
  type Notice,
  type NoticeCategory,
} from '@/types/notice';

const FORM_ID = 'notice-form';
const NONE = '__none__';

const CATEGORIES: NoticeCategory[] = [
  'ACADEMIC',
  'HOLIDAY',
  'EVENTS',
  'EMERGENCY',
  'EXAMINATION',
  'GENERAL',
];
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.STUDENT,
  UserRole.PARENT,
  UserRole.ACCOUNTANT,
  UserRole.LIBRARIAN,
];

const noticeFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    content: z.string().trim().min(1, 'Write the notice').max(20_000),
    category: z.enum(['ACADEMIC', 'HOLIDAY', 'EVENTS', 'EMERGENCY', 'EXAMINATION', 'GENERAL']),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    isPinned: z.boolean(),
    publishAt: z.string().optional(),
    expiresAt: z.string().optional(),
    /** Audience and staged files live in the form so one reset clears them. */
    roles: z.array(z.nativeEnum(UserRole)),
    classIds: z.array(z.string().uuid()),
    files: z.array(z.custom<File>()),
  })
  .refine(
    (data) => !data.publishAt || !data.expiresAt || data.expiresAt > data.publishAt,
    { message: 'The expiry must be after the publish date', path: ['expiresAt'] },
  );

type NoticeFormValues = z.infer<typeof noticeFormSchema>;

const EMPTY: NoticeFormValues = {
  title: '',
  content: '',
  category: 'GENERAL',
  priority: 'MEDIUM',
  isPinned: false,
  publishAt: '',
  expiresAt: '',
  roles: [],
  classIds: [],
  files: [],
};

interface NoticeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notice: Notice | null;
}

export function NoticeFormDialog({ open, onOpenChange, notice }: NoticeFormDialogProps) {
  const queryClient = useQueryClient();

  const [classToAdd, setClassToAdd] = useState(NONE);

  const classes = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
    enabled: open,
  });

  const form = useForm<NoticeFormValues>({
    resolver: zodResolver(noticeFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;

    form.reset(
      notice
        ? {
            title: notice.title,
            content: notice.content,
            category: notice.category,
            priority: notice.priority,
            isPinned: notice.isPinned,
            publishAt: notice.publishAt?.slice(0, 16) ?? '',
            expiresAt: notice.expiresAt?.slice(0, 16) ?? '',
            roles: notice.audiences.flatMap((rule) => (rule.role ? [rule.role] : [])),
            classIds: notice.audiences.flatMap((rule) => (rule.classId ? [rule.classId] : [])),
            files: [],
          }
        : EMPTY,
    );
  }, [open, notice, form]);

  const roles = form.watch('roles');
  const classIds = form.watch('classIds');
  const files = form.watch('files');

  const buildAudiences = (values: NoticeFormValues): AudienceRulePayload[] => [
    ...values.roles.map((role) => ({ role })),
    ...values.classIds.map((classId) => ({ classId })),
  ];

  const saveMutation = useMutation({
    mutationFn: async ({ values, publishNow }: { values: NoticeFormValues; publishNow: boolean }) => {
      const audiences = buildAudiences(values);

      const payload = {
        title: values.title,
        content: values.content,
        category: values.category,
        priority: values.priority,
        isPinned: values.isPinned,
        publishAt: values.publishAt ? new Date(values.publishAt).toISOString() : null,
        expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
        audiences,
      };

      const saved = notice
        ? await noticeService.update(notice.id, payload)
        : await noticeService.create({ ...payload, attachmentIds: [], publishNow });

      if (values.files.length > 0) {
        return noticeService.uploadAttachments(saved.id, values.files);
      }

      return saved;
    },
    onSuccess: async (_saved, variables) => {
      toast.success(
        notice
          ? 'Notice updated'
          : variables.publishNow
            ? 'Notice published'
            : 'Notice saved as a draft',
      );
      await queryClient.invalidateQueries({ queryKey: ['notices'] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not save the notice');
    },
  });

  const submit = async (values: NoticeFormValues, publishNow: boolean) => {
    try {
      await saveMutation.mutateAsync({ values, publishNow });
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'title',
        'content',
        'category',
        'priority',
        'publishAt',
        'expiresAt',
      ]);
    }
  };

  const toggleRole = (role: UserRole, checked: boolean) => {
    form.setValue('roles', checked ? [...roles, role] : roles.filter((value) => value !== role));
  };

  const isEveryone = roles.length === 0 && classIds.length === 0;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={notice ? 'Edit notice' : 'New notice'}
      description={
        notice
          ? 'Changes do not re-notify the audience.'
          : 'Save a draft, or publish straight away to notify the audience.'
      }
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel={notice ? 'Save changes' : 'Save draft'}
      size="xl"
    >
      <Form {...form}>
        <form
          id={FORM_ID}
          className="space-y-5"
          noValidate
          onSubmit={form.handleSubmit((values) => submit(values, false))}
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Mid-term examination schedule" autoFocus />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notice</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={8} placeholder="Write the full notice here…" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {NOTICE_CATEGORY_LABELS[category]}
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
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {PRIORITY_LABELS[priority]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="publishAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Publish at</FormLabel>
                  <FormControl>
                    <Input {...field} type="datetime-local" />
                  </FormControl>
                  <FormDescription>Leave blank to publish manually.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expiresAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expires at</FormLabel>
                  <FormControl>
                    <Input {...field} type="datetime-local" />
                  </FormControl>
                  <FormDescription>The notice drops off the board after this.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="isPinned"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-3">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Pin to the top of the board</FormLabel>
                  <FormDescription>Pinned notices sort above everything else.</FormDescription>
                </div>
              </FormItem>
            )}
          />

          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">Audience</legend>

            <p className="text-muted-foreground text-sm">
              {isEveryone
                ? 'Everyone will see this notice.'
                : 'Only the selected roles and classes will see this notice.'}
            </p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ROLES.map((role) => (
                <div key={role} className="flex items-center gap-2">
                  <Checkbox
                    id={`role-${role}`}
                    checked={roles.includes(role)}
                    onCheckedChange={(checked) => toggleRole(role, checked === true)}
                  />
                  <Label htmlFor={`role-${role}`} className="text-sm font-normal">
                    {ROLE_LABELS[role]}
                  </Label>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Classes</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={classToAdd} onValueChange={setClassToAdd}>
                  <SelectTrigger className="w-[14rem]" aria-label="Add a class to the audience">
                    <SelectValue placeholder="Add a class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Choose a class…</SelectItem>
                    {(classes.data ?? [])
                      .filter((option) => !classIds.includes(option.id))
                      .map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="outline"
                  disabled={classToAdd === NONE}
                  onClick={() => {
                    form.setValue('classIds', [...classIds, classToAdd]);
                    setClassToAdd(NONE);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add
                </Button>
              </div>

              {classIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {classIds.map((classId) => {
                    const option = (classes.data ?? []).find((entry) => entry.id === classId);
                    return (
                      <Badge key={classId} variant="secondary" className="gap-1">
                        {option?.name ?? 'Class'}
                        <button
                          type="button"
                          aria-label={`Remove ${option?.name ?? 'class'}`}
                          onClick={() =>
                            form.setValue(
                              'classIds',
                              classIds.filter((id) => id !== classId),
                            )
                          }
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="notice-attachments">Attachments</Label>
            <Input
              id="notice-attachments"
              type="file"
              multiple
              onChange={(event) =>
                form.setValue('files', Array.from(event.target.files ?? []))
              }
            />
            {files.length > 0 && (
              <p className="text-muted-foreground text-sm">
                {files.length} file(s) will be uploaded after the notice is saved.
              </p>
            )}
          </div>

          {!notice && (
            <Button
              type="button"
              className="w-full"
              disabled={form.formState.isSubmitting}
              onClick={form.handleSubmit((values) => submit(values, true))}
            >
              Publish now
            </Button>
          )}
        </form>
      </Form>
    </FormDialog>
  );
}
