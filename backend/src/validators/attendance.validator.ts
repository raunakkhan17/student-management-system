import { AttendanceStatus, AttendanceSessionStatus } from '@prisma/client';
import { z } from 'zod';
import { dateOnlySchema, optionalString, paginationQuerySchema, requiredString } from './common.validator';

/** One student's mark within a session. */
export const attendanceRecordSchema = z.object({
  studentId: z.string().uuid(),
  status: z.nativeEnum(AttendanceStatus),
  minutesLate: z.coerce.number().int().min(0).max(600).optional(),
  remarks: optionalString(200),
});

export const markAttendanceSchema = z
  .object({
    classId: z.string().uuid('Select a class'),
    sectionId: z.string().uuid('Select a section'),
    subjectId: z.string().uuid().nullish(),
    periodId: z.string().uuid().nullish(),
    date: dateOnlySchema,
    records: z.array(attendanceRecordSchema).min(1, 'Mark at least one student'),
    /** Submitting locks the roll against further edits by the teacher. */
    submit: z.boolean().default(false),
    remarks: optionalString(300),
  })
  .refine(
    (data) => {
      const ids = data.records.map((record) => record.studentId);
      return new Set(ids).size === ids.length;
    },
    { message: 'A student appears more than once', path: ['records'] },
  );

/** Admin correction to an already-submitted session. */
export const updateAttendanceSchema = z.object({
  records: z.array(attendanceRecordSchema).min(1),
  remarks: optionalString(300),
});

export const attendanceSessionQuerySchema = paginationQuerySchema.extend({
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  status: z.nativeEnum(AttendanceSessionStatus).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});

/** Roster for a class/section on a date, pre-filled with any existing marks. */
export const attendanceSheetQuerySchema = z.object({
  classId: z.string().uuid('Select a class'),
  sectionId: z.string().uuid('Select a section'),
  subjectId: z.string().uuid().optional(),
  periodId: z.string().uuid().optional(),
  date: dateOnlySchema,
});

export const monthlyAttendanceQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const studentAttendanceQuerySchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});

export const attendanceReportQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  from: dateOnlySchema,
  to: dateOnlySchema,
  format: z.enum(['csv', 'xlsx']).default('xlsx'),
});

export const createHolidaySchema = z
  .object({
    academicYearId: z.string().uuid('Select an academic year'),
    name: requiredString('Name', 120),
    date: dateOnlySchema,
    endDate: dateOnlySchema.optional(),
    description: optionalString(300),
  })
  .refine((data) => !data.endDate || data.endDate >= data.date, {
    message: 'The end date cannot be before the start date',
    path: ['endDate'],
  });

/** Separate from the create schema because `.refine()` makes it non-partial-able. */
export const updateHolidaySchema = z
  .object({
    name: requiredString('Name', 120).optional(),
    date: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    description: optionalString(300),
  })
  .refine((data) => !data.endDate || !data.date || data.endDate >= data.date, {
    message: 'The end date cannot be before the start date',
    path: ['endDate'],
  });

export const holidayQuerySchema = paginationQuerySchema.extend({
  academicYearId: z.string().uuid().optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;
export type AttendanceRecordInput = z.infer<typeof attendanceRecordSchema>;
export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
