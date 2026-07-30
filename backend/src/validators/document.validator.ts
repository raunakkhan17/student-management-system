import { DocumentType, VerificationStatus } from '@prisma/client';
import { z } from 'zod';
import {
  csvToArray,
  dateOnlySchema,
  optionalString,
  paginationQuerySchema,
  requiredString,
} from './common.validator';

/**
 * A document belongs to exactly one owner.
 *
 * `studentId` and `teacherId` are both nullable on the model, so the
 * either-or rule has to be enforced here rather than by a constraint.
 */
export const uploadDocumentSchema = z
  .object({
    type: z.nativeEnum(DocumentType),
    title: requiredString('Title', 200),
    studentId: z.string().uuid().nullish(),
    teacherId: z.string().uuid().nullish(),
    issuedDate: dateOnlySchema.optional(),
    expiryDate: dateOnlySchema.optional(),
    remarks: optionalString(1000),
  })
  .refine((data) => Boolean(data.studentId) !== Boolean(data.teacherId), {
    message: 'Attach the document to either a student or a member of staff',
    path: ['studentId'],
  })
  .refine(
    (data) => !data.issuedDate || !data.expiryDate || data.expiryDate > data.issuedDate,
    { message: 'The expiry must be after the issue date', path: ['expiryDate'] },
  );

export const updateDocumentSchema = z.object({
  type: z.nativeEnum(DocumentType).optional(),
  title: requiredString('Title', 200).optional(),
  issuedDate: dateOnlySchema.optional(),
  expiryDate: dateOnlySchema.optional(),
  remarks: optionalString(1000),
});

export const verifyDocumentSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  remarks: optionalString(1000),
});

export const documentQuerySchema = paginationQuerySchema.extend({
  studentId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  type: z.nativeEnum(DocumentType).optional(),
  status: csvToArray(z.nativeEnum(VerificationStatus)),
  /** Documents that have lapsed or lapse within the warning window. */
  expiringSoon: z.coerce.boolean().default(false),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type VerifyDocumentInput = z.infer<typeof verifyDocumentSchema>;
