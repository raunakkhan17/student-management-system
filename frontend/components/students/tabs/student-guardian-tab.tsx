'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Mail, Phone, ShieldCheck, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { formatCurrency } from '@/lib/format';
import { studentService } from '@/services/student.service';
import {
  GUARDIAN_RELATION_LABELS,
  type StudentDetail,
  type StudentGuardianLink,
} from '@/types/student';

export function StudentGuardianTab({ student }: { student: StudentDetail }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const removeTarget = useConfirmTarget<StudentGuardianLink>();

  const removeMutation = useMutation({
    mutationFn: (guardianId: string) => studentService.removeGuardian(student.id, guardianId),
    onSuccess: async () => {
      toast.success('Guardian unlinked');
      await queryClient.invalidateQueries({ queryKey: ['students', student.id] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not unlink the guardian');
    },
  });

  if (student.guardians.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Users}
            title="No guardians linked"
            description="Link a parent or guardian so they can follow this student's progress."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {student.guardians.map((link) => (
          <Card key={link.id}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {link.guardian.firstName} {link.guardian.lastName}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {GUARDIAN_RELATION_LABELS[link.relation]}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {link.isPrimary && (
                    <Badge className="bg-primary-muted text-primary border-transparent">Primary</Badge>
                  )}
                  {link.guardian.userId && (
                    <Badge variant="secondary">
                      <ShieldCheck className="size-3" aria-hidden />
                      Has portal access
                    </Badge>
                  )}
                </div>
              </div>

              <dl className="text-muted-foreground space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5 shrink-0" aria-hidden />
                  <span className="text-foreground">{link.guardian.phone}</span>
                  {link.guardian.alternatePhone && <span>· {link.guardian.alternatePhone}</span>}
                </div>
                {link.guardian.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="size-3.5 shrink-0" aria-hidden />
                    <span className="text-foreground truncate">{link.guardian.email}</span>
                  </div>
                )}
                {link.guardian.occupation && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="size-3.5 shrink-0" aria-hidden />
                    <span className="text-foreground">
                      {link.guardian.occupation}
                      {link.guardian.organization ? ` · ${link.guardian.organization}` : ''}
                    </span>
                  </div>
                )}
                {link.guardian.annualIncome && (
                  <div className="flex items-center gap-2">
                    <span className="w-3.5" aria-hidden />
                    <span className="text-foreground">
                      Annual income {formatCurrency(link.guardian.annualIncome)}
                    </span>
                  </div>
                )}
              </dl>

              {can('STUDENTS', 'EDIT') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeTarget.open(link)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Unlink guardian
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={removeTarget.isOpen}
        onOpenChange={removeTarget.onOpenChange}
        title="Unlink this guardian?"
        description={
          <>
            <strong>
              {removeTarget.target?.guardian.firstName} {removeTarget.target?.guardian.lastName}
            </strong>{' '}
            will no longer be linked to this student. The guardian record itself is kept, along with
            any links to other students.
          </>
        }
        confirmLabel="Unlink guardian"
        variant="destructive"
        onConfirm={async () => {
          if (removeTarget.target) {
            await removeMutation.mutateAsync(removeTarget.target.guardian.id);
          }
        }}
      />
    </>
  );
}
