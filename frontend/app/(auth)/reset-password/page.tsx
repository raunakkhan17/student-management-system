import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const metadata: Metadata = {
  title: 'Reset password',
};

// Next 16: `searchParams` is a Promise and must be awaited.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawToken = params['token'];
  const token = Array.isArray(rawToken) ? (rawToken[0] ?? '') : (rawToken ?? '');

  return <ResetPasswordForm token={token} />;
}
