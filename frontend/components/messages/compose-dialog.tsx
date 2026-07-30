'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/common/form-dialog';
import { UserPicker } from '@/components/common/user-picker';
import { Badge } from '@/components/ui/badge';
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
import { messageService } from '@/services/message.service';
import { ROLE_LABELS } from '@/types/enums';
import type { RecipientOption } from '@/types/message';

const FORM_ID = 'compose-message-form';

const composeFormSchema = z.object({
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1, 'Write a message').max(5000),
  /** Recipients and staged files live in the form so one reset clears them. */
  recipients: z.array(z.custom<RecipientOption>()).min(1, 'Choose at least one recipient'),
  files: z.array(z.custom<File>()),
});

type ComposeFormValues = z.infer<typeof composeFormSchema>;

interface ComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new conversation id so the caller can open the thread. */
  onSent?: (conversationId: string) => void;
}

export function ComposeDialog({ open, onOpenChange, onSent }: ComposeDialogProps) {
  const queryClient = useQueryClient();

  const form = useForm<ComposeFormValues>({
    resolver: zodResolver(composeFormSchema),
    defaultValues: { subject: '', body: '', recipients: [], files: [] },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({ subject: '', body: '', recipients: [], files: [] });
  }, [open, form]);

  const recipients = form.watch('recipients');
  const files = form.watch('files');

  const mutation = useMutation({
    mutationFn: async (values: ComposeFormValues) => {
      // Attachments are uploaded first so the message carries their ids.
      const uploaded =
        values.files.length > 0 ? await messageService.uploadAttachments(values.files) : [];

      return messageService.startConversation({
        participantIds: values.recipients.map((recipient) => recipient.id),
        body: values.body,
        attachmentIds: uploaded.map((asset) => asset.id),
        ...(values.subject ? { subject: values.subject } : {}),
      });
    },
    onSuccess: async (conversation) => {
      toast.success('Message sent');
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
      onSent?.(conversation.id);
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not send the message');
    },
  });

  const onSubmit = async (values: ComposeFormValues) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, ['subject', 'body']);
    }
  };

  const addRecipient = (recipient: RecipientOption | null) => {
    if (!recipient) return;
    if (recipients.some((entry) => entry.id === recipient.id)) return;
    form.setValue('recipients', [...recipients, recipient], { shouldValidate: true });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New message"
      description="Add one person for a direct message, or several for a group thread."
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Send message"
      size="lg"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label>To</Label>
            <UserPicker value={null} onChange={(_id, recipient) => addRecipient(recipient)} />
            {form.formState.errors.recipients && (
              <p className="text-destructive text-sm">
                {form.formState.errors.recipients.message}
              </p>
            )}

            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {recipients.map((recipient) => (
                  <Badge key={recipient.id} variant="secondary" className="gap-1">
                    {recipient.firstName} {recipient.lastName}
                    <span className="text-muted-foreground">· {ROLE_LABELS[recipient.role]}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${recipient.firstName} ${recipient.lastName}`}
                      onClick={() =>
                        form.setValue(
                          'recipients',
                          recipients.filter((entry) => entry.id !== recipient.id),
                        )
                      }
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {recipients.length > 1 && (
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Field trip planning" />
                  </FormControl>
                  <FormDescription>Group threads read better with a subject.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="body"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Message</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={6} placeholder="Write your message…" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            <Label htmlFor="message-attachments">Attachments</Label>
            <Input
              id="message-attachments"
              type="file"
              multiple
              onChange={(event) =>
                form.setValue('files', Array.from(event.target.files ?? []))
              }
            />
            {files.length > 0 && (
              <p className="text-muted-foreground text-sm">{files.length} file(s) attached.</p>
            )}
          </div>
        </form>
      </Form>
    </FormDialog>
  );
}
