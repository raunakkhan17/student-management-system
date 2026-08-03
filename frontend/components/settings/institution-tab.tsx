'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { applyApiErrors } from '@/lib/form-errors';
import { settingsService } from '@/services/settings.service';
import type { Institution } from '@/types/settings';

const currentYear = new Date().getUTCFullYear();

const formSchema = z.object({
  name: z.string().trim().min(1, 'Institution name is required').max(200),
  code: z.string().trim().min(1, 'Code is required').max(30),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().min(1, 'Phone is required').max(20),
  website: z.string().trim().url('Enter a valid URL').or(z.literal('')),
  establishedYear: z
    .union([z.coerce.number().int().min(1800).max(currentYear), z.literal('')])
    .optional(),
  affiliation: z.string().trim().max(200),
  principalName: z.string().trim().max(120),
  currency: z.string().trim().min(1, 'Currency is required').max(8),
  timezone: z.string().trim().min(1, 'Timezone is required').max(60),
  line1: z.string().trim().min(1, 'Address line 1 is required').max(200),
  line2: z.string().trim().max(200),
  city: z.string().trim().min(1, 'City is required').max(100),
  state: z.string().trim().min(1, 'State is required').max(100),
  country: z.string().trim().min(1, 'Country is required').max(100),
  postalCode: z.string().trim().min(1, 'Postal code is required').max(12),
});

type FormValues = z.input<typeof formSchema>;

function toFormValues(institution: Institution | null): FormValues {
  return {
    name: institution?.name ?? '',
    code: institution?.code ?? '',
    email: institution?.email ?? '',
    phone: institution?.phone ?? '',
    website: institution?.website ?? '',
    establishedYear: institution?.establishedYear ?? '',
    affiliation: institution?.affiliation ?? '',
    principalName: institution?.principalName ?? '',
    currency: institution?.currency ?? 'INR',
    timezone: institution?.timezone ?? 'Asia/Kolkata',
    line1: institution?.address?.line1 ?? '',
    line2: institution?.address?.line2 ?? '',
    city: institution?.address?.city ?? '',
    state: institution?.address?.state ?? '',
    country: institution?.address?.country ?? 'India',
    postalCode: institution?.address?.postalCode ?? '',
  };
}

/**
 * The institution profile prints on report cards, receipts and ID cards, so
 * this is the one place those documents get their letterhead from.
 */
export function InstitutionTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = can('SETTINGS', 'EDIT');

  const query = useQuery({
    queryKey: ['settings', 'institution'],
    queryFn: () => settingsService.getInstitution(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(null),
  });

  // Load the saved profile when it arrives, then let local edits own the form.
  const [loadedFrom, setLoadedFrom] = useState<Institution | null | undefined>(undefined);
  if (query.data !== undefined && query.data !== loadedFrom) {
    setLoadedFrom(query.data);
    form.reset(toFormValues(query.data));
  }

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const parsed = formSchema.parse(values);
      return settingsService.saveInstitution({
        name: parsed.name,
        code: parsed.code,
        email: parsed.email,
        phone: parsed.phone,
        website: parsed.website === '' ? null : parsed.website,
        establishedYear:
          parsed.establishedYear === '' || parsed.establishedYear === undefined
            ? null
            : Number(parsed.establishedYear),
        affiliation: parsed.affiliation === '' ? null : parsed.affiliation,
        principalName: parsed.principalName === '' ? null : parsed.principalName,
        currency: parsed.currency,
        timezone: parsed.timezone,
        logoId: query.data?.logoId ?? null,
        address: {
          line1: parsed.line1,
          line2: parsed.line2 === '' ? null : parsed.line2,
          city: parsed.city,
          state: parsed.state,
          country: parsed.country,
          postalCode: parsed.postalCode,
        },
      });
    },
    onSuccess: async () => {
      toast.success('Institution profile saved');
      await queryClient.invalidateQueries({ queryKey: ['settings', 'institution'] });
    },
    onError: (error) => {
      applyApiErrors(error, form.setError, ['name', 'code', 'email', 'phone', 'website']);
      toast.error('Could not save the institution profile');
    },
  });

  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutateAsync(values))}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>
              Printed on report cards, fee receipts and student ID cards.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Institution name</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={!canEdit} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={!canEdit} />
                  </FormControl>
                  <FormDescription>Short identifier used on printed documents.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} disabled={!canEdit} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={!canEdit} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input placeholder="https://" {...field} disabled={!canEdit} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="establishedYear"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Established</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} disabled={!canEdit} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="affiliation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Affiliation</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={!canEdit} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="principalName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Principal</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={!canEdit} />
                  </FormControl>
                  <FormDescription>Signs off published report cards.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['line1', 'Address line 1'],
                ['line2', 'Address line 2'],
                ['city', 'City'],
                ['state', 'State'],
                ['country', 'Country'],
                ['postalCode', 'Postal code'],
              ] as const
            ).map(([name, label]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={!canEdit} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Regional</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={!canEdit} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={!canEdit} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.isPending || !form.formState.isDirty}>
              {mutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
