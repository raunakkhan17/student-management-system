'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { PasswordInput } from '@/components/common/password-input';
import { PasswordStrength } from '@/components/common/password-strength';
import { applyApiErrors } from '@/lib/form-errors';
import { changePasswordSchema, type ChangePasswordFormValues } from '@/lib/validations/auth';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';

export function ChangePasswordForm() {
  const router = useRouter();
  const clear = useAuthStore((state) => state.clear);
  const [formError, setFormError] = useState('');

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const newPassword = form.watch('newPassword');

  const onSubmit = async (values: ChangePasswordFormValues) => {
    setFormError('');
    try {
      await authService.changePassword(values);
      toast.success('Password changed. Please sign in again.');
      // The server revoked every session, including this one.
      clear();
      router.replace('/login');
    } catch (error) {
      setFormError(
        applyApiErrors(error, form.setError, ['currentPassword', 'newPassword', 'confirmPassword']),
      );
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {formError && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current password</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  autoComplete="current-password"
                  disabled={form.formState.isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  autoComplete="new-password"
                  disabled={form.formState.isSubmitting}
                />
              </FormControl>
              <PasswordStrength password={newPassword} />
              <FormDescription>
                At least 8 characters, with upper and lowercase letters and a number.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  autoComplete="new-password"
                  disabled={form.formState.isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <>
              <span
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden
              />
              Updating…
            </>
          ) : (
            <>
              <KeyRound className="size-4" aria-hidden />
              Change password
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
