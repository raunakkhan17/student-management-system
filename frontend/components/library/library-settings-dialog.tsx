'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import { libraryService } from '@/services/library.service';
import type { LibrarySettings } from '@/types/library';

const FORM_ID = 'library-settings-form';

const settingsSchema = z.object({
  finePerDay: z.coerce.number().nonnegative().max(10_000),
  maxIssueDays: z.coerce.number().int().min(1).max(365),
  maxRenewals: z.coerce.number().int().min(0).max(10),
  maxBooksPerMember: z.coerce.number().int().min(1).max(50),
  lostBookMultiplier: z.coerce.number().min(1).max(10),
});

type SettingsValues = z.infer<typeof settingsSchema>;

interface LibrarySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Circulation rules: loan period, renewals, borrowing limit and fines. */
export function LibrarySettingsDialog({ open, onOpenChange }: LibrarySettingsDialogProps) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['library', 'settings'],
    queryFn: () => libraryService.getSettings(),
    enabled: open,
  });

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      finePerDay: 5,
      maxIssueDays: 14,
      maxRenewals: 2,
      maxBooksPerMember: 5,
      lostBookMultiplier: 2,
    },
  });

  useEffect(() => {
    if (!open || !query.data) return;
    form.reset(query.data);
  }, [open, query.data, form]);

  const mutation = useMutation({
    mutationFn: (values: LibrarySettings) => libraryService.saveSettings(values),
    onSuccess: async () => {
      toast.success('Circulation rules saved');
      await queryClient.invalidateQueries({ queryKey: ['library'] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not save the rules');
    },
  });

  const onSubmit = async (values: SettingsValues) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'finePerDay',
        'maxIssueDays',
        'maxRenewals',
        'maxBooksPerMember',
        'lostBookMultiplier',
      ]);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Circulation rules"
      description="These apply to every loan issued from now on."
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Save rules"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="maxIssueDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loan period (days)</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={1} max={365} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maxBooksPerMember"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Books per member</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={1} max={50} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maxRenewals"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Renewals allowed</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={0} max={10} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="finePerDay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fine per day</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="decimal" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="lostBookMultiplier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lost book multiplier</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="decimal" />
                </FormControl>
                <FormDescription>
                  A lost copy is charged its price multiplied by this figure.
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
