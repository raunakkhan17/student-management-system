import {
  ConcessionType,
  FeeCategoryType,
  InvoiceStatus,
  PaymentMethod,
} from '@prisma/client';
import { z } from 'zod';
import {
  csvToArray,
  dateOnlySchema,
  optionalString,
  paginationQuerySchema,
  requiredString,
} from './common.validator';

/** Currency amount: two decimal places, never negative. */
const amountSchema = z.coerce
  .number()
  .nonnegative('Amount cannot be negative')
  .max(99_999_999, 'Amount is too large')
  .refine((value) => Number.isFinite(value), 'Enter a valid amount');

const positiveAmountSchema = amountSchema.refine((value) => value > 0, 'Amount must be more than zero');

// ------------------------------------------------------------- Fee categories

export const createFeeCategorySchema = z.object({
  name: requiredString('Name', 120),
  type: z.nativeEnum(FeeCategoryType),
  description: optionalString(300),
  isRecurring: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateFeeCategorySchema = createFeeCategorySchema.partial();

export const feeCategoryQuerySchema = paginationQuerySchema.extend({
  type: z.nativeEnum(FeeCategoryType).optional(),
  isActive: z.coerce.boolean().optional(),
});

// ------------------------------------------------------------ Fee structures

export const createFeeStructureSchema = z.object({
  name: requiredString('Name', 160),
  academicYearId: z.string().uuid('Select an academic year'),
  classId: z.string().uuid().nullish(),
  courseId: z.string().uuid().nullish(),
  description: optionalString(300),
  isActive: z.boolean().default(true),
  items: z
    .array(
      z.object({
        feeCategoryId: z.string().uuid(),
        amount: positiveAmountSchema,
        isOptional: z.boolean().default(false),
        dueDate: dateOnlySchema.optional(),
      }),
    )
    .min(1, 'Add at least one fee line')
    .max(30),
});

export const updateFeeStructureSchema = z.object({
  name: requiredString('Name', 160).optional(),
  classId: z.string().uuid().nullish(),
  courseId: z.string().uuid().nullish(),
  description: optionalString(300),
  isActive: z.boolean().optional(),
  items: createFeeStructureSchema.shape.items.optional(),
});

export const feeStructureQuerySchema = paginationQuerySchema.extend({
  academicYearId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
});

// -------------------------------------------------------------------- Invoices

export const createInvoiceSchema = z
  .object({
    studentId: z.string().uuid('Select a student'),
    academicYearId: z.string().uuid('Select an academic year'),
    /** When supplied, the invoice lines are copied from the structure. */
    feeStructureId: z.string().uuid().nullish(),
    issueDate: dateOnlySchema,
    dueDate: dateOnlySchema,
    notes: optionalString(500),
    /** Ad-hoc lines, used when no structure is chosen or to add extras. */
    items: z
      .array(
        z.object({
          feeCategoryId: z.string().uuid(),
          description: requiredString('Description', 200),
          amount: positiveAmountSchema,
        }),
      )
      .max(30)
      .default([]),
    /** Splits the invoice into scheduled installments. */
    installments: z
      .array(
        z.object({
          amount: positiveAmountSchema,
          dueDate: dateOnlySchema,
        }),
      )
      .max(12)
      .default([]),
    /** Applies the student's active scholarships and discounts. */
    applyConcessions: z.boolean().default(true),
  })
  .refine((data) => data.dueDate >= data.issueDate, {
    message: 'The due date cannot be before the issue date',
    path: ['dueDate'],
  })
  .refine((data) => Boolean(data.feeStructureId) || data.items.length > 0, {
    message: 'Choose a fee structure or add at least one line',
    path: ['items'],
  });

/** Issues one invoice per student in a class — the normal start-of-term action. */
export const bulkInvoiceSchema = z
  .object({
    feeStructureId: z.string().uuid('Select a fee structure'),
    academicYearId: z.string().uuid('Select an academic year'),
    classId: z.string().uuid('Select a class'),
    sectionId: z.string().uuid().nullish(),
    issueDate: dateOnlySchema,
    dueDate: dateOnlySchema,
    notes: optionalString(500),
    installmentCount: z.coerce.number().int().min(1).max(12).default(1),
    applyConcessions: z.boolean().default(true),
  })
  .refine((data) => data.dueDate >= data.issueDate, {
    message: 'The due date cannot be before the issue date',
    path: ['dueDate'],
  });

export const updateInvoiceSchema = z.object({
  dueDate: dateOnlySchema.optional(),
  notes: optionalString(500),
  status: z.nativeEnum(InvoiceStatus).optional(),
});

export const invoiceQuerySchema = paginationQuerySchema.extend({
  studentId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  status: csvToArray(z.nativeEnum(InvoiceStatus)),
  issuedFrom: dateOnlySchema.optional(),
  issuedTo: dateOnlySchema.optional(),
  /** Only invoices with an outstanding balance. */
  onlyOutstanding: z.coerce.boolean().default(false),
});

// -------------------------------------------------------------------- Payments

export const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid('Select an invoice'),
  installmentId: z.string().uuid().nullish(),
  amount: positiveAmountSchema,
  method: z.nativeEnum(PaymentMethod),
  paidAt: z.coerce.date().default(() => new Date()),
  transactionRef: optionalString(120),
  remarks: optionalString(300),
});

export const paymentQuerySchema = paginationQuerySchema.extend({
  studentId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  method: z.nativeEnum(PaymentMethod).optional(),
  paidFrom: dateOnlySchema.optional(),
  paidTo: dateOnlySchema.optional(),
});

export const refundPaymentSchema = z.object({
  reason: requiredString('Reason', 300),
});

// ------------------------------------------------------ Scholarships/discounts

export const createScholarshipSchema = z.object({
  name: requiredString('Name', 160),
  description: optionalString(300),
  type: z.nativeEnum(ConcessionType),
  value: positiveAmountSchema,
  academicYearId: z.string().uuid().nullish(),
  isActive: z.boolean().default(true),
});

export const awardScholarshipSchema = z.object({
  studentId: z.string().uuid('Select a student'),
  scholarshipId: z.string().uuid('Select a scholarship'),
  academicYearId: z.string().uuid('Select an academic year'),
  awardedDate: dateOnlySchema,
  remarks: optionalString(300),
});

export const createDiscountSchema = z.object({
  name: requiredString('Name', 160),
  reason: optionalString(300),
  type: z.nativeEnum(ConcessionType),
  value: positiveAmountSchema,
  academicYearId: z.string().uuid().nullish(),
  isActive: z.boolean().default(true),
});

export const awardDiscountSchema = z.object({
  studentId: z.string().uuid('Select a student'),
  discountId: z.string().uuid('Select a discount'),
  academicYearId: z.string().uuid('Select an academic year'),
  remarks: optionalString(300),
});

// -------------------------------------------------------------- Late fee rules

export const createLateFeeRuleSchema = z.object({
  name: requiredString('Name', 120),
  gracePeriodDays: z.coerce.number().int().min(0).max(365).default(0),
  chargeType: z.nativeEnum(ConcessionType).default('FIXED'),
  chargeValue: positiveAmountSchema,
  isRecurringDaily: z.boolean().default(false),
  maxCharge: amountSchema.optional(),
  isActive: z.boolean().default(true),
});

export const applyLateFeesSchema = z.object({
  ruleId: z.string().uuid('Select a late fee rule'),
  academicYearId: z.string().uuid().optional(),
  /** Preview the effect without writing anything. */
  dryRun: z.boolean().default(true),
});

// --------------------------------------------------------------------- Reports

export const feeReportQuerySchema = z.object({
  academicYearId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  format: z.enum(['csv', 'xlsx']).default('xlsx'),
});

export const collectionSummaryQuerySchema = z.object({
  academicYearId: z.string().uuid().optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});

export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type BulkInvoiceInput = z.infer<typeof bulkInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type ApplyLateFeesInput = z.infer<typeof applyLateFeesSchema>;
export type CreateLateFeeRuleInput = z.infer<typeof createLateFeeRuleSchema>;
