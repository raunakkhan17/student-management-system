'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/lib/validations/auth';
import { authService } from '@/services/auth.service';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const password = form.watch('newPassword');

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setFormError('');
    try {
      await authService.resetPassword({ token, ...values });
      setDone(true);
    } catch (error) {
      setFormError(applyApiErrors(error, form.setError, ['newPassword', 'confirmPassword']));
    }
  };

  if (!token) {
    return (
      <div className="space-y-6 text-center">
        <span className="bg-destructive-muted text-destructive mx-auto grid size-14 place-items-center rounded-full">
          <AlertCircle className="size-7" aria-hidden />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Link is incomplete</h1>
          <p className="text-muted-foreground text-sm">
            This reset link is missing its token. Request a new one to continue.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-6 text-center">
        <span className="bg-success-muted text-success mx-auto grid size-14 place-items-center rounded-full">
          <CheckCircle2 className="size-7" aria-hidden />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Password updated</h1>
          <p className="text-muted-foreground text-sm">
            Your password has been changed and all other sessions were signed out.
          </p>
        </div>
        <Button className="w-full" size="lg" onClick={() => router.replace('/login')}>
          Continue to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="text-muted-foreground text-sm">
          Choose a strong password you don&apos;t use anywhere else.
        </p>
      </div>

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
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <PasswordInput
                    {...field}
                    autoComplete="new-password"
                    autoFocus
                    disabled={form.formState.isSubmitting}
                  />
                </FormControl>
                <PasswordStrength password={password} />
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

          <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
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
                Update password
              </>
            )}
          </Button>
        </form>
      </Form>

      <Button asChild variant="ghost" className="w-full">
        <Link href="/login">
          <ArrowLeft className="size-4" aria-hidden />
          Back to sign in
        </Link>
      </Button>
    </div>
  );
}
