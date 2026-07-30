import { AcademicTermStatus, SubjectType } from '@prisma/client';
import { z } from 'zod';
import {
  dateOnlySchema,
  optionalString,
  paginationQuerySchema,
  requiredString,
} from './common.validator';

/** Uppercase alphanumeric code with dashes, e.g. `CSE-01`. */
const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, 'Code must be at least 2 characters')
  .max(20, 'Code must be at most 20 characters')
  .regex(/^[A-Z0-9-]+$/, 'Use letters, numbers and dashes only');

// ---------------------------------------------------------------- Academic year

export const createAcademicYearSchema = z
  .object({
    name: requiredString('Name', 50),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    isCurrent: z.boolean().default(false),
    status: z.nativeEnum(AcademicTermStatus).default('UPCOMING'),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: 'The end date must be after the start date',
    path: ['endDate'],
  });

export const updateAcademicYearSchema = z
  .object({
    name: requiredString('Name', 50).optional(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    isCurrent: z.boolean().optional(),
    status: z.nativeEnum(AcademicTermStatus).optional(),
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate > data.startDate, {
    message: 'The end date must be after the start date',
    path: ['endDate'],
  });

export const academicYearQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(AcademicTermStatus).optional(),
  isCurrent: z.coerce.boolean().optional(),
});

// ------------------------------------------------------------------- Department

export const createDepartmentSchema = z.object({
  name: requiredString('Name', 120),
  code: codeSchema,
  description: optionalString(500),
  headTeacherId: z.string().uuid().nullish(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export const departmentQuerySchema = paginationQuerySchema;

// ----------------------------------------------------------------------- Course

export const createCourseSchema = z.object({
  name: requiredString('Name', 120),
  code: codeSchema,
  departmentId: z.string().uuid('Select a department'),
  durationYears: z.coerce.number().int().min(1).max(10).default(1),
  description: optionalString(500),
});

export const updateCourseSchema = createCourseSchema.partial();

export const courseQuerySchema = paginationQuerySchema.extend({
  departmentId: z.string().uuid().optional(),
});

// ------------------------------------------------------------------------ Class

export const createClassSchema = z.object({
  name: requiredString('Name', 80),
  code: codeSchema,
  academicYearId: z.string().uuid('Select an academic year'),
  departmentId: z.string().uuid().nullish(),
  courseId: z.string().uuid().nullish(),
  yearLevel: z.coerce.number().int().min(1).max(12).default(1),
  capacity: z.coerce.number().int().min(1).max(500).default(60),
  classTeacherId: z.string().uuid().nullish(),
});

export const updateClassSchema = createClassSchema.partial();

export const classQuerySchema = paginationQuerySchema.extend({
  academicYearId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------- Section

export const createSectionSchema = z.object({
  name: requiredString('Name', 20),
  classId: z.string().uuid('Select a class'),
  capacity: z.coerce.number().int().min(1).max(200).default(40),
  classTeacherId: z.string().uuid().nullish(),
  roomId: z.string().uuid().nullish(),
});

export const updateSectionSchema = createSectionSchema.partial().omit({ classId: true });

export const sectionQuerySchema = paginationQuerySchema.extend({
  classId: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------- Subject

export const createSubjectSchema = z.object({
  name: requiredString('Name', 120),
  code: codeSchema,
  departmentId: z.string().uuid().nullish(),
  type: z.nativeEnum(SubjectType).default('CORE'),
  credits: z.coerce.number().int().min(0).max(20).default(0),
  description: optionalString(500),
});

export const updateSubjectSchema = createSubjectSchema.partial();

export const subjectQuerySchema = paginationQuerySchema.extend({
  departmentId: z.string().uuid().optional(),
  type: z.nativeEnum(SubjectType).optional(),
});

// --------------------------------------------------------------------- Semester

export const createSemesterSchema = z
  .object({
    name: requiredString('Name', 50),
    academicYearId: z.string().uuid('Select an academic year'),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    status: z.nativeEnum(AcademicTermStatus).default('UPCOMING'),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: 'The end date must be after the start date',
    path: ['endDate'],
  });

export const updateSemesterSchema = z
  .object({
    name: requiredString('Name', 50).optional(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    status: z.nativeEnum(AcademicTermStatus).optional(),
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate > data.startDate, {
    message: 'The end date must be after the start date',
    path: ['endDate'],
  });

export const semesterQuerySchema = paginationQuerySchema.extend({
  academicYearId: z.string().uuid().optional(),
  status: z.nativeEnum(AcademicTermStatus).optional(),
});

// ----------------------------------------------------- Subject offering (class)

export const createClassSubjectSchema = z.object({
  classId: z.string().uuid('Select a class'),
  sectionId: z.string().uuid().nullish(),
  subjectId: z.string().uuid('Select a subject'),
  semesterId: z.string().uuid().nullish(),
  teacherId: z.string().uuid().nullish(),
  isElective: z.boolean().default(false),
});

export const updateClassSubjectSchema = z.object({
  teacherId: z.string().uuid().nullish(),
  semesterId: z.string().uuid().nullish(),
  isElective: z.boolean().optional(),
});

export const classSubjectQuerySchema = paginationQuerySchema.extend({
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  semesterId: z.string().uuid().optional(),
  isElective: z.coerce.boolean().optional(),
});

/** Student's elective choices for a term. */
export const setStudentElectivesSchema = z.object({
  classSubjectIds: z.array(z.string().uuid()).max(20),
});

export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type CreateClassInput = z.infer<typeof createClassSchema>;
export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type CreateSemesterInput = z.infer<typeof createSemesterSchema>;
export type CreateClassSubjectInput = z.infer<typeof createClassSubjectSchema>;
