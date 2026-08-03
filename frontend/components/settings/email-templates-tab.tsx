'use client';

import { useQuery } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { settingsService } from '@/services/settings.service';

/**
 * Read-only by design. Editing a template safely needs variable validation and
 * a rendered preview — without those, a saved typo in a `{{placeholder}}` would
 * silently ship broken mail to every recipient. Bodies live in the seed.
 */
export function EmailTemplatesTab() {
  const query = useQuery({
    queryKey: ['settings', 'email-templates'],
    queryFn: () => settingsService.listEmailTemplates(),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const templates = query.data ?? [];

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="No email templates"
        description="Templates are created by the database seed."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        These are the messages EduCore sends. Bodies are maintained in the codebase so a change is
        reviewed before it reaches recipients.
      </p>

      {templates.map((template) => (
        <Card key={template.id}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base">{template.name}</CardTitle>
                <CardDescription className="mt-1">
                  {template.description ?? 'No description.'}
                </CardDescription>
              </div>
              <Badge variant={template.isActive ? 'default' : 'secondary'}>
                {template.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Subject
              </p>
              <p className="mt-1 text-sm">{template.subject}</p>
            </div>

            {template.variables && template.variables.length > 0 && (
              <div>
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Variables
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {template.variables.map((variable) => (
                    <code
                      key={variable}
                      className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs"
                    >
                      {`{{${variable}}}`}
                    </code>
                  ))}
                </div>
              </div>
            )}

            <p className="text-muted-foreground text-xs">
              Key <code className="font-mono">{template.key}</code> · updated{' '}
              {formatDate(template.updatedAt)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
