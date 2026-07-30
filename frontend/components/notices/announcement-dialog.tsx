'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/common/form-dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import { noticeService } from '@/services/notice.service';
import { ROLE_LABELS, UserRole } from '@/types/enums';

const FORM_ID = 'announcement-form';

const ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.STUDENT,
  UserRole.PARENT,
  UserRole.ACCOUNTANT,
  UserRole.LIBRARIAN,
];

const announcementFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  body: z.string().trim().min(1, 'Write the message').max(2000),
  link: z.string().trim().max(300).optional(),
  /** Empty means everyone. Held in the form so one reset clears it all. */
  roles: z.array(z.nativeEnum(UserRole)),
});

type AnnouncementFormValues = z.infer<typeof announcementFormSchema>;

interface AnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The announcement centre from PRD Module 16.
 *
 * Unlike a notice this is not archived on the board — it is a straight push to
 * the notification centre, for things like "the campus closes early today".
 */
export function AnnouncementDialog({ open, onOpenChange }: AnnouncementDialogProps) {
  const queryClient = useQueryClient();

  const form = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: { title: '', body: '', link: '', roles: [] },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({ title: '', body: '', link: '', roles: [] });
  }, [open, form]);

  const mutation = useMutation({
    mutationFn: (values: AnnouncementFormValues) =>
      noticeService.sendAnnouncement({
        title: values.title,
        body: values.body,
        roles: values.roles,
        ...(values.link ? { link: values.link } : {}),
      }),
    onSuccess: async (result) => {
      toast.success(`Announcement sent to ${result.delivered} recipient(s)`);
      await queryClient.invalidateQueries({ queryKey: ['messages', 'notifications'] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not send the announcement');
    },
  });

  const onSubmit = async (values: AnnouncementFormValues) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, ['title', 'body', 'link']);
    }
  };

  const roles = form.watch('roles');

  const toggleRole = (role: UserRole, checked: boolean) => {
    form.setValue(
      'roles',
      checked ? [...roles, role] : roles.filter((value) => value !== role),
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Send an announcement"
      description="Delivered straight to the notification centre. It is not archived on the board."
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Send announcement"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Campus closes early today" autoFocus />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="body"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Message</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={4} placeholder="Keep it short and specific." />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-3">
            <Label>Send to</Label>
            <p className="text-muted-foreground text-sm">
              {roles.length === 0
                ? 'Everyone will receive this.'
                : `Only ${roles.length} selected role(s) will receive this.`}
            </p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ROLES.map((role) => (
                <div key={role} className="flex items-center gap-2">
                  <Checkbox
                    id={`announce-${role}`}
                    checked={roles.includes(role)}
                    onCheckedChange={(checked) => toggleRole(role, checked === true)}
                  />
                  <Label htmlFor={`announce-${role}`} className="text-sm font-normal">
                    {ROLE_LABELS[role]}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <FormField
            control={form.control}
            name="link"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Link</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="/fees" />
                </FormControl>
                <FormDescription>
                  Optional in-app path opened when the notification is clicked.
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
