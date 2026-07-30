import { ApplicantType, LeaveType, RequestStatus } from '@prisma/client';
import { z } from 'zod';
import {
  csvToArray,
  dateOnlySchema,
  optionalString,
  paginationQuerySchema,
  requiredString,
} from './common.validator';

export const applyLeaveSchema = z
  .object({
    /**
     * Omitted when applying for yourself. Staff applying on behalf of a student
     * must name them.
     */
    applicantId: z.string().uuid().optional(),
    type: z.nativeEnum(LeaveType),
    fromDate: dateOnlySchema,
    toDate: dateOnlySchema,
    /** Half days are allowed, so this is a decimal. */
    totalDays: z.coerce.number().positive().max(365).optional(),
    reason: requiredString('Reason', 1000),
    attachmentId: z.string().uuid().nullish(),
  })
  .refine((data) => data.toDate >= data.fromDate, {
    message: 'The end date must not be before the start date',
    path: ['toDate'],
  });

export const reviewLeaveSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewComment: optionalString(500),
});

export const leaveQuerySchema = paginationQuerySchema.extend({
  applicantId: z.string().uuid().optional(),
  applicantType: z.nativeEnum(ApplicantType).optional(),
  type: z.nativeEnum(LeaveType).optional(),
  status: csvToArray(z.nativeEnum(RequestStatus)),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});

/**
 * Month window for the leave calendar.
 *
 * Left as a plain object because the `validate` middleware needs a ZodObject for
 * query params; the range itself is checked in the service.
 */
export const leaveCalendarQuerySchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
  applicantType: z.nativeEnum(ApplicantType).optional(),
});

export const leaveBalanceQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
});

export const saveLeaveBalancesSchema = z.object({
  userId: z.string().uuid('Select a user'),
  academicYearId: z.string().uuid('Select an academic year'),
  balances: z
    .array(
      z.object({
        type: z.nativeEnum(LeaveType),
        allocated: z.coerce.number().nonnegative().max(365),
      }),
    )
    .min(1, 'Set at least one allowance')
    .max(20),
});

export type ApplyLeaveInput = z.infer<typeof applyLeaveSchema>;
export type ReviewLeaveInput = z.infer<typeof reviewLeaveSchema>;
export type SaveLeaveBalancesInput = z.infer<typeof saveLeaveBalancesSchema>;
