import type { ListQueryParams } from './api';

export type DocumentType =
  | 'PHOTO'
  | 'BIRTH_CERTIFICATE'
  | 'TRANSFER_CERTIFICATE'
  | 'MARKSHEET'
  | 'IDENTITY_PROOF'
  | 'ADDRESS_PROOF'
  | 'MEDICAL_RECORD'
  | 'ADMISSION_FORM'
  | 'REPORT_CARD'
  | 'CHARACTER_CERTIFICATE'
  | 'MIGRATION_CERTIFICATE'
  | 'CASTE_CERTIFICATE'
  | 'QUALIFICATION'
  | 'EXPERIENCE_LETTER'
  | 'RESUME'
  | 'OTHER';

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  PHOTO: 'Photograph',
  BIRTH_CERTIFICATE: 'Birth certificate',
  TRANSFER_CERTIFICATE: 'Transfer certificate',
  MARKSHEET: 'Marksheet',
  IDENTITY_PROOF: 'Identity proof',
  ADDRESS_PROOF: 'Address proof',
  MEDICAL_RECORD: 'Medical record',
  ADMISSION_FORM: 'Admission form',
  REPORT_CARD: 'Report card',
  CHARACTER_CERTIFICATE: 'Character certificate',
  MIGRATION_CERTIFICATE: 'Migration certificate',
  CASTE_CERTIFICATE: 'Caste certificate',
  QUALIFICATION: 'Qualification',
  EXPERIENCE_LETTER: 'Experience letter',
  RESUME: 'Résumé',
  OTHER: 'Other',
};

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  PENDING: 'Awaiting review',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
};

/** Types that only make sense for a member of staff. */
export const STAFF_DOCUMENT_TYPES: DocumentType[] = [
  'QUALIFICATION',
  'EXPERIENCE_LETTER',
  'RESUME',
];

export interface StudentDocument {
  id: string;
  fileId: string;
  type: DocumentType;
  title: string;
  studentId: string | null;
  teacherId: string | null;
  status: VerificationStatus;
  issuedDate: string | null;
  expiryDate: string | null;
  verifiedAt: string | null;
  remarks: string | null;
  createdAt: string;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
  };
  student: {
    id: string;
    admissionNumber: string;
    userId: string;
    user: { firstName: string; lastName: string };
    class: { name: string } | null;
    section: { name: string } | null;
  } | null;
  teacher: {
    id: string;
    employeeId: string;
    userId: string;
    user: { firstName: string; lastName: string };
    department: { name: string } | null;
  } | null;
  verifiedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface ExpiringDocument {
  id: string;
  title: string;
  type: DocumentType;
  expiryDate: string | null;
  ownerName: string;
  ownerIdentifier: string | null;
  daysRemaining: number;
}

export interface DocumentStats {
  total: number;
  pending: number;
  verified: number;
  rejected: number;
  expiring: number;
}

// -------------------------------------------------------------------- Payloads

export interface UpdateDocumentPayload {
  type?: DocumentType;
  title?: string;
  issuedDate?: string;
  expiryDate?: string;
  remarks?: string;
}

export interface VerifyDocumentPayload {
  status: 'VERIFIED' | 'REJECTED';
  remarks?: string;
}

export interface DocumentQuery extends ListQueryParams {
  studentId?: string;
  teacherId?: string;
  type?: DocumentType;
  status?: string;
  expiringSoon?: boolean;
}
