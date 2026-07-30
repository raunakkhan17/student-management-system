import { BloodGroup, EmployeeStatus, EmploymentType, Gender } from '@prisma/client';
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
import { addressSchema } from './student.validator';

export const salarySchema = z.object({
  basicSalary: z.coerce.number().nonnegative().max(99_999_999),
  allowances: z.coerce.number().nonnegative().max(99_999_999).default(0),
  deductions: z.coerce.number().nonnegative().max(99_999_999).default(0),
  effectiveFrom: dateOnlySchema,
  effectiveTo: dateOnlySchema.optional(),
  remarks: optionalString(300),
});

export const createTeacherSchema = z.object({
  firstName: requiredString('First name', 80),
  lastName: requiredString('Last name', 80),
  email: emailSchema,
  phone: phoneSchema,

  /** Auto-generated when omitted, e.g. `EMP/2026/0007`. */
  employeeId: optionalString(40),
  departmentId: z.string().uuid().nullish(),
  designation: requiredString('Designation', 120),
  qualification: requiredString('Qualification', 200),
  specialization: optionalString(160),
  experienceYears: z.coerce.number().int().min(0).max(60).default(0),
  joiningDate: dateOnlySchema,
  employmentType: z.nativeEnum(EmploymentType).default('FULL_TIME'),

  gender: z.nativeEnum(Gender),
  dateOfBirth: dateOnlySchema.optional(),
  bloodGroup: z.nativeEnum(BloodGroup).nullish(),

  address: addressSchema.optional(),

  /** Subjects this teacher is qualified to teach. */
  subjectIds: z.array(z.string().uuid()).max(30).default([]),

  salary: salarySchema.optional(),

  createPortalAccount: z.boolean().default(true),
});

export const updateTeacherSchema = z.object({
  firstName: requiredString('First name', 80).optional(),
  lastName: requiredString('Last name', 80).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  departmentId: z.string().uuid().nullish(),
  designation: requiredString('Designation', 120).optional(),
  qualification: requiredString('Qualification', 200).optional(),
  specialization: optionalString(160),
  experienceYears: z.coerce.number().int().min(0).max(60).optional(),
  joiningDate: dateOnlySchema.optional(),
  employmentType: z.nativeEnum(EmploymentType).optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
  gender: z.nativeEnum(Gender).optional(),
  dateOfBirth: dateOnlySchema.optional(),
  bloodGroup: z.nativeEnum(BloodGroup).nullish(),
  address: addressSchema.optional(),
});

export const teacherQuerySchema = paginationQuerySchema.extend({
  departmentId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  status: csvToArray(z.nativeEnum(EmployeeStatus)),
  employmentType: z.nativeEnum(EmploymentType).optional(),
  gender: z.nativeEnum(Gender).optional(),
  includeArchived: z.coerce.boolean().default(false),
});

export const assignSubjectsSchema = z.object({
  subjectIds: z.array(z.string().uuid()).max(30),
});

/** Makes the teacher class teacher of a class or a specific section. */
export const assignClassSchema = z
  .object({
    classId: z.string().uuid().nullish(),
    sectionId: z.string().uuid().nullish(),
  })
  .refine((data) => Boolean(data.classId) || Boolean(data.sectionId), {
    message: 'Choose a class or a section to assign',
    path: ['classId'],
  });

export const changeTeacherStatusSchema = z.object({
  status: z.nativeEnum(EmployeeStatus),
  remarks: optionalString(300),
});

export const teacherExportQuerySchema = teacherQuerySchema.extend({
  format: z.enum(['csv', 'xlsx']).default('xlsx'),
});

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;
export type SalaryInput = z.infer<typeof salarySchema>;
