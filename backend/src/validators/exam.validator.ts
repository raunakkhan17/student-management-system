import { ExamStatus, ExamType } from '@prisma/client';
import { z } from 'zod';
import {
  csvToArray,
  dateOnlySchema,
  optionalString,
  paginationQuerySchema,
  requiredString,
  timeSchema,
} from './common.validator';

export const createExamSchema = z
  .object({
    name: requiredString('Name', 160),
    type: z.nativeEnum(ExamType),
    academicYearId: z.string().uuid('Select an academic year'),
    semesterId: z.string().uuid().nullish(),
    classId: z.string().uuid().nullish(),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    gradeScaleId: z.string().uuid().nullish(),
    description: optionalString(1000),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'The end date cannot be before the start date',
    path: ['endDate'],
  });

export const updateExamSchema = z
  .object({
    name: requiredString('Name', 160).optional(),
    type: z.nativeEnum(ExamType).optional(),
    semesterId: z.string().uuid().nullish(),
    classId: z.string().uuid().nullish(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    gradeScaleId: z.string().uuid().nullish(),
    description: optionalString(1000),
    status: z.nativeEnum(ExamStatus).optional(),
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
    message: 'The end date cannot be before the start date',
    path: ['endDate'],
  });

export const examQuerySchema = paginationQuerySchema.extend({
  academicYearId: z.string().uuid().optional(),
  semesterId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  type: z.nativeEnum(ExamType).optional(),
  status: csvToArray(z.nativeEnum(ExamStatus)),
});

/** One subject paper within an exam. */
export const examScheduleSchema = z
  .object({
    classId: z.string().uuid('Select a class'),
    sectionId: z.string().uuid().nullish(),
    subjectId: z.string().uuid('Select a subject'),
    examDate: dateOnlySchema,
    startTime: timeSchema,
    endTime: timeSchema,
    roomId: z.string().uuid().nullish(),
    invigilatorId: z.string().uuid().nullish(),
    maxMarks: z.coerce.number().positive().max(1000),
    passingMarks: z.coerce.number().min(0).max(1000),
    weightage: z.coerce.number().positive().max(100).default(100),
    instructions: optionalString(1000),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'The end time must be after the start time',
    path: ['endTime'],
  })
  .refine((data) => data.passingMarks <= data.maxMarks, {
    message: 'Passing marks cannot exceed the maximum',
    path: ['passingMarks'],
  });

export const updateExamScheduleSchema = z
  .object({
    examDate: dateOnlySchema.optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    roomId: z.string().uuid().nullish(),
    invigilatorId: z.string().uuid().nullish(),
    maxMarks: z.coerce.number().positive().max(1000).optional(),
    passingMarks: z.coerce.number().min(0).max(1000).optional(),
    weightage: z.coerce.number().positive().max(100).optional(),
    instructions: optionalString(1000),
  })
  .refine((data) => !data.startTime || !data.endTime || data.endTime > data.startTime, {
    message: 'The end time must be after the start time',
    path: ['endTime'],
  });

/** Bulk marks entry for one paper. */
export const enterMarksSchema = z
  .object({
    marks: z
      .array(
        z.object({
          studentId: z.string().uuid(),
          marksObtained: z.coerce.number().min(0).max(1000).nullish(),
          isAbsent: z.boolean().default(false),
          remarks: optionalString(200),
        }),
      )
      .min(1, 'Enter at least one mark'),
  })
  .refine(
    (data) => {
      const ids = data.marks.map((mark) => mark.studentId);
      return new Set(ids).size === ids.length;
    },
    { message: 'A student appears more than once', path: ['marks'] },
  )
  .refine(
    // An absent student has no score; a present one must have a number.
    (data) => data.marks.every((mark) => mark.isAbsent || mark.marksObtained !== null),
    { message: 'Enter a mark, or flag the student absent', path: ['marks'] },
  );

export const publishResultsSchema = z.object({
  /** Skips the completeness check when an administrator accepts partial entry. */
  allowIncomplete: z.boolean().default(false),
});

export const gradeBandSchema = z.object({
  grade: requiredString('Grade', 10),
  minPercent: z.coerce.number().min(0).max(100),
  maxPercent: z.coerce.number().min(0).max(100),
  gradePoint: z.coerce.number().min(0).max(10),
  description: optionalString(120),
  isPass: z.boolean().default(true),
});

export const createGradeScaleSchema = z.object({
  name: requiredString('Name', 120),
  description: optionalString(300),
  isDefault: z.boolean().default(false),
  bands: z.array(gradeBandSchema).min(1, 'Add at least one band').max(30),
});

export const updateGradeScaleSchema = z.object({
  name: requiredString('Name', 120).optional(),
  description: optionalString(300),
  isDefault: z.boolean().optional(),
  bands: z.array(gradeBandSchema).min(1).max(30).optional(),
});

export const reportCardQuerySchema = paginationQuerySchema.extend({
  examId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
});

export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;
export type ExamScheduleInput = z.infer<typeof examScheduleSchema>;
export type EnterMarksInput = z.infer<typeof enterMarksSchema>;
export type CreateGradeScaleInput = z.infer<typeof createGradeScaleSchema>;
