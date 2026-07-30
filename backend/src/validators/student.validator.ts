import { AddressType, BloodGroup, Gender, GuardianRelation, StudentStatus } from '@prisma/client';
import { z } from 'zod';
import {
  csvToArray,
  dateOnlySchema,
  emailSchema,
  optionalString,
  paginationQuerySchema,
  phoneSchema,
  requiredString,
} from './common.validator';

export const addressSchema = z.object({
  type: z.nativeEnum(AddressType).default('PERMANENT'),
  line1: requiredString('Address line 1', 200),
  line2: optionalString(200),
  landmark: optionalString(120),
  city: requiredString('City', 80),
  state: requiredString('State', 80),
  country: requiredString('Country', 80).default('India'),
  postalCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9\s-]{4,12}$/, 'Enter a valid postal code'),
});

/** 12 digits, optionally spaced in groups of four. */
const aadhaarSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{12}$/, 'Aadhaar must be 12 digits'));

export const guardianSchema = z.object({
  firstName: requiredString('First name', 80),
  lastName: requiredString('Last name', 80),
  relation: z.nativeEnum(GuardianRelation),
  occupation: optionalString(120),
  organization: optionalString(120),
  phone: phoneSchema,
  alternatePhone: phoneSchema.optional(),
  email: emailSchema.optional(),
  annualIncome: z.coerce.number().nonnegative().max(999_999_999).optional(),
  aadhaarNumber: aadhaarSchema.optional(),
  qualification: optionalString(120),
  isPrimary: z.boolean().default(false),
  /** Creates a Parent login for this guardian. */
  createPortalAccount: z.boolean().default(false),
  address: addressSchema.optional(),
});

export const createStudentSchema = z
  .object({
    // Identity
    firstName: requiredString('First name', 80),
    lastName: requiredString('Last name', 80),
    email: emailSchema,
    phone: phoneSchema.optional(),

    // Admission — auto-generated when omitted.
    admissionNumber: optionalString(40),
    rollNumber: optionalString(20),
    admissionDate: dateOnlySchema,

    // Placement
    academicYearId: z.string().uuid('Select an academic year'),
    classId: z.string().uuid().nullish(),
    sectionId: z.string().uuid().nullish(),

    // Personal
    gender: z.nativeEnum(Gender),
    dateOfBirth: dateOnlySchema,
    bloodGroup: z.nativeEnum(BloodGroup).nullish(),
    aadhaarNumber: aadhaarSchema.optional(),
    nationality: requiredString('Nationality', 60).default('India'),
    religion: optionalString(60),
    category: optionalString(60),
    motherTongue: optionalString(60),
    previousSchool: optionalString(160),

    // Emergency contact
    emergencyContactName: requiredString('Emergency contact name', 120),
    emergencyContactPhone: phoneSchema,
    emergencyContactRelation: requiredString('Emergency contact relation', 60),

    // Addresses
    permanentAddress: addressSchema.optional(),
    currentAddress: addressSchema.optional(),
    /** Copies the permanent address into the current address. */
    sameAsPermanent: z.boolean().default(false),

    guardians: z.array(guardianSchema).max(4).default([]),

    /** Creates the student's own login. */
    createPortalAccount: z.boolean().default(true),
  })
  .refine((data) => data.dateOfBirth < new Date(), {
    message: 'Date of birth must be in the past',
    path: ['dateOfBirth'],
  })
  .refine((data) => data.guardians.filter((guardian) => guardian.isPrimary).length <= 1, {
    message: 'Only one guardian can be marked primary',
    path: ['guardians'],
  })
  .refine((data) => !data.sectionId || Boolean(data.classId), {
    message: 'Select a class before choosing a section',
    path: ['sectionId'],
  });

export const updateStudentSchema = z.object({
  firstName: requiredString('First name', 80).optional(),
  lastName: requiredString('Last name', 80).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.nullish(),
  rollNumber: optionalString(20),
  classId: z.string().uuid().nullish(),
  sectionId: z.string().uuid().nullish(),
  gender: z.nativeEnum(Gender).optional(),
  dateOfBirth: dateOnlySchema.optional(),
  bloodGroup: z.nativeEnum(BloodGroup).nullish(),
  aadhaarNumber: aadhaarSchema.optional(),
  nationality: requiredString('Nationality', 60).optional(),
  religion: optionalString(60),
  category: optionalString(60),
  motherTongue: optionalString(60),
  previousSchool: optionalString(160),
  emergencyContactName: requiredString('Emergency contact name', 120).optional(),
  emergencyContactPhone: phoneSchema.optional(),
  emergencyContactRelation: requiredString('Emergency contact relation', 60).optional(),
  permanentAddress: addressSchema.optional(),
  currentAddress: addressSchema.optional(),
  status: z.nativeEnum(StudentStatus).optional(),
});

export const studentQuerySchema = paginationQuerySchema.extend({
  academicYearId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  gender: z.nativeEnum(Gender).optional(),
  bloodGroup: z.nativeEnum(BloodGroup).optional(),
  status: csvToArray(z.nativeEnum(StudentStatus)),
  admittedFrom: dateOnlySchema.optional(),
  admittedTo: dateOnlySchema.optional(),
  /** Includes archived and soft-deleted records. */
  includeArchived: z.coerce.boolean().default(false),
});

/** Bulk promotion to the next class for a new academic year. */
export const promoteStudentsSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1, 'Select at least one student').max(500),
  toAcademicYearId: z.string().uuid('Select the target academic year'),
  toClassId: z.string().uuid('Select the target class'),
  toSectionId: z.string().uuid().nullish(),
  effectiveDate: dateOnlySchema,
  remarks: optionalString(300),
});

/** Moves a student between classes or sections within a year. */
export const transferStudentSchema = z.object({
  toClassId: z.string().uuid('Select the target class'),
  toSectionId: z.string().uuid().nullish(),
  effectiveDate: dateOnlySchema,
  remarks: optionalString(300),
});

export const changeStatusSchema = z.object({
  status: z.nativeEnum(StudentStatus),
  remarks: optionalString(300),
});

export const guardianLinkSchema = guardianSchema;

export const timelineEventSchema = z.object({
  type: z.enum([
    'ADMISSION',
    'PROMOTION',
    'TRANSFER',
    'ACHIEVEMENT',
    'DISCIPLINARY',
    'MEDICAL',
    'DOCUMENT',
    'FEE',
    'EXAM',
    'ATTENDANCE',
    'LEAVE',
    'GENERAL',
  ]),
  title: requiredString('Title', 160),
  description: optionalString(1000),
  occurredAt: z.coerce.date().default(() => new Date()),
});

export const studentExportQuerySchema = studentQuerySchema.extend({
  format: z.enum(['csv', 'xlsx']).default('xlsx'),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type PromoteStudentsInput = z.infer<typeof promoteStudentsSchema>;
export type TransferStudentInput = z.infer<typeof transferStudentSchema>;
export type GuardianInput = z.infer<typeof guardianSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
