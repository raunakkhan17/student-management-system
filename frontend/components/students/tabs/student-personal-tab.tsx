'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, humanizeEnum } from '@/lib/format';
import { BLOOD_GROUP_LABELS, GENDER_LABELS } from '@/types/enums';
import type { AddressRecord } from '@/types/teacher';
import type { StudentDetail } from '@/types/student';

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm font-medium break-words">
        {value === null || value === undefined || value === '' ? (
          <span className="text-muted-foreground font-normal">—</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function formatAddress(address: AddressRecord | null): string {
  if (!address) return '';
  return [address.line1, address.line2, address.landmark, address.city, address.state, address.country, address.postalCode]
    .filter(Boolean)
    .join(', ');
}

export function StudentPersonalTab({ student }: { student: StudentDetail }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <DetailRow label="Full name" value={`${student.user.firstName} ${student.user.lastName}`} />
            <DetailRow label="Email" value={student.user.email} />
            <DetailRow label="Phone" value={student.user.phone} />
            <DetailRow label="Gender" value={GENDER_LABELS[student.gender]} />
            <DetailRow label="Date of birth" value={formatDate(student.dateOfBirth)} />
            <DetailRow
              label="Blood group"
              value={student.bloodGroup ? BLOOD_GROUP_LABELS[student.bloodGroup] : null}
            />
            <DetailRow label="Aadhaar number" value={student.aadhaarNumber} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Background</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <DetailRow label="Nationality" value={student.nationality} />
            <DetailRow label="Religion" value={student.religion} />
            <DetailRow label="Category" value={student.category} />
            <DetailRow label="Mother tongue" value={student.motherTongue} />
            <DetailRow label="Previous school" value={student.previousSchool} />
            <DetailRow label="Account status" value={humanizeEnum(student.user.status)} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emergency contact</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <DetailRow label="Name" value={student.emergencyContactName} />
            <DetailRow label="Phone" value={student.emergencyContactPhone} />
            <DetailRow label="Relationship" value={student.emergencyContactRelation} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <DetailRow label="Permanent" value={formatAddress(student.permanentAddress)} />
            <DetailRow label="Current" value={formatAddress(student.currentAddress)} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
