import type { Metadata } from 'next';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Change password',
};

export default function ChangePasswordPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Change password"
        description="Choosing a new password signs you out of every device, including this one."
      />
      <Card>
        <CardContent className="pt-6">
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
