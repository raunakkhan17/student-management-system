import { AssignmentStatus, SubmissionStatus } from '@prisma/client';
import { z } from 'zod';
import {
  csvToArray,
  dateOnlySchema,
  optionalString,
  paginationQuerySchema,
  requiredString,
} from './common.validator';

export const createAssignmentSchema = z
  .object({
    title: requiredString('Title', 200),
    description: requiredString('Description', 5000),
    classId: z.string().uuid('Select a class'),
    sectionId: z.string().uuid().nullish(),
    subjectId: z.string().uuid('Select a subject'),
    assignedDate: dateOnlySchema,
    /** Full timestamp — the deadline matters to the minute. */
    dueDate: z.coerce.date(),
    maxMarks: z.coerce.number().min(0).max(1000),
    allowLateSubmission: z.boolean().default(false),
    /** Publishing makes it visible to students immediately. */
    publish: z.boolean().default(false),
  })
  .refine((data) => data.dueDate.getTime() > data.assignedDate.getTime(), {
    message: 'The due date must be after the assigned date',
    path: ['dueDate'],
  });

export const updateAssignmentSchema = z
  .object({
    title: requiredString('Title', 200).optional(),
    description: requiredString('Description', 5000).optional(),
    sectionId: z.string().uuid().nullish(),
    assignedDate: dateOnlySchema.optional(),
    dueDate: z.coerce.date().optional(),
    maxMarks: z.coerce.number().min(0).max(1000).optional(),
    allowLateSubmission: z.boolean().optional(),
    status: z.nativeEnum(AssignmentStatus).optional(),
  })
  .refine(
    (data) =>
      !data.dueDate || !data.assignedDate || data.dueDate.getTime() > data.assignedDate.getTime(),
    { message: 'The due date must be after the assigned date', path: ['dueDate'] },
  );

export const assignmentQuerySchema = paginationQuerySchema.extend({
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  status: csvToArray(z.nativeEnum(AssignmentStatus)),
  dueFrom: z.coerce.date().optional(),
  dueTo: z.coerce.date().optional(),
  /** Students only: restricts to work that is still outstanding. */
  onlyPending: z.coerce.boolean().default(false),
});

/** A student's own submission. */
export const submitAssignmentSchema = z.object({
  content: optionalString(5000),
});

export const evaluateSubmissionSchema = z.object({
  marksObtained: z.coerce.number().min(0).max(1000),
  feedback: optionalString(2000),
  /** RESUBMIT sends it back to the student rather than closing it. */
  status: z.enum(['EVALUATED', 'RESUBMIT']).default('EVALUATED'),
});

export const submissionQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(SubmissionStatus).optional(),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;
export type EvaluateSubmissionInput = z.infer<typeof evaluateSubmissionSchema>;
