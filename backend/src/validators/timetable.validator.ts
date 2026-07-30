import { DayOfWeek, RoomType, SlotType } from '@prisma/client';
import { z } from 'zod';
import {
  dateOnlySchema,
  optionalString,
  paginationQuerySchema,
  requiredString,
  timeSchema,
} from './common.validator';

// ----------------------------------------------------------------------- Rooms

export const createRoomSchema = z.object({
  name: requiredString('Name', 120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9-]+$/, 'Use letters, numbers and dashes only'),
  type: z.nativeEnum(RoomType).default('CLASSROOM'),
  capacity: z.coerce.number().int().min(1).max(1000).default(40),
  building: optionalString(80),
  floor: optionalString(40),
});

export const updateRoomSchema = createRoomSchema.partial();

export const roomQuerySchema = paginationQuerySchema.extend({
  type: z.nativeEnum(RoomType).optional(),
});

// --------------------------------------------------------------------- Periods

export const createPeriodSchema = z
  .object({
    name: requiredString('Name', 50),
    startTime: timeSchema,
    endTime: timeSchema,
    sortOrder: z.coerce.number().int().min(1).max(50),
    isBreak: z.boolean().default(false),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'The end time must be after the start time',
    path: ['endTime'],
  });

export const updatePeriodSchema = z
  .object({
    name: requiredString('Name', 50).optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    sortOrder: z.coerce.number().int().min(1).max(50).optional(),
    isBreak: z.boolean().optional(),
  })
  .refine((data) => !data.startTime || !data.endTime || data.endTime > data.startTime, {
    message: 'The end time must be after the start time',
    path: ['endTime'],
  });

// ------------------------------------------------------------------ Timetables

export const createTimetableSchema = z
  .object({
    name: requiredString('Name', 120),
    classId: z.string().uuid('Select a class'),
    sectionId: z.string().uuid('Select a section'),
    academicYearId: z.string().uuid('Select an academic year'),
    semesterId: z.string().uuid().nullish(),
    effectiveFrom: dateOnlySchema,
    effectiveTo: dateOnlySchema.optional(),
    isActive: z.boolean().default(false),
  })
  .refine((data) => !data.effectiveTo || data.effectiveTo > data.effectiveFrom, {
    message: 'The end date must be after the start date',
    path: ['effectiveTo'],
  });

export const updateTimetableSchema = z
  .object({
    name: requiredString('Name', 120).optional(),
    semesterId: z.string().uuid().nullish(),
    effectiveFrom: dateOnlySchema.optional(),
    effectiveTo: dateOnlySchema.nullish(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => !data.effectiveTo || !data.effectiveFrom || data.effectiveTo > data.effectiveFrom,
    { message: 'The end date must be after the start date', path: ['effectiveTo'] },
  );

export const timetableQuerySchema = paginationQuerySchema.extend({
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
});

// ----------------------------------------------------------------------- Slots

export const upsertSlotSchema = z.object({
  dayOfWeek: z.nativeEnum(DayOfWeek),
  periodId: z.string().uuid('Select a period'),
  classSubjectId: z.string().uuid().nullish(),
  teacherId: z.string().uuid().nullish(),
  roomId: z.string().uuid().nullish(),
  type: z.nativeEnum(SlotType).default('LECTURE'),
  note: optionalString(200),
});

/** Replaces the whole grid in one request, so conflicts are checked as a set. */
export const bulkSlotsSchema = z.object({
  slots: z.array(upsertSlotSchema).max(100),
});

export const teacherTimetableQuerySchema = z.object({
  teacherId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type CreatePeriodInput = z.infer<typeof createPeriodSchema>;
export type CreateTimetableInput = z.infer<typeof createTimetableSchema>;
export type UpsertSlotInput = z.infer<typeof upsertSlotSchema>;
export type BulkSlotsInput = z.infer<typeof bulkSlotsSchema>;
