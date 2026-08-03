import { z } from 'zod';
import { optionalString, requiredString } from './common.validator';

const addressSchema = z.object({
  line1: requiredString('Address line 1', 200),
  line2: optionalString(200),
  landmark: optionalString(120),
  city: requiredString('City', 100),
  state: requiredString('State', 100),
  country: requiredString('Country', 100).default('India'),
  postalCode: requiredString('Postal code', 12),
});

export const institutionSchema = z.object({
  name: requiredString('Institution name', 200),
  code: requiredString('Institution code', 30),
  email: z.string().email('Enter a valid email address'),
  phone: requiredString('Phone', 20),
  website: z.string().url('Enter a valid URL').nullish().or(z.literal('')),
  establishedYear: z.coerce
    .number()
    .int()
    .min(1800)
    // A future founding date is always a typo.
    .max(new Date().getUTCFullYear())
    .nullish(),
  affiliation: optionalString(200),
  principalName: optionalString(120),
  currency: requiredString('Currency', 8).default('INR'),
  timezone: requiredString('Timezone', 60).default('Asia/Kolkata'),
  logoId: z.string().uuid().nullish(),
  address: addressSchema.optional(),
});

export const attendanceRulesSchema = z.object({
  /** Omitted means the current academic year. */
  academicYearId: z.string().uuid().optional(),
  minAttendancePercent: z.coerce.number().min(0).max(100),
  lateThresholdMinutes: z.coerce.number().int().min(0).max(240),
  halfDayThresholdMinutes: z.coerce.number().int().min(0).max(600),
  autoLockAfterHours: z.coerce.number().int().min(1).max(720),
  allowBackdatedDays: z.coerce.number().int().min(0).max(90),
  countLateAsPresent: z.coerce.boolean(),
});

export const attendanceRulesQuerySchema = z.object({
  academicYearId: z.string().uuid().optional(),
});

export type InstitutionInput = z.infer<typeof institutionSchema>;
export type AttendanceRulesInput = z.infer<typeof attendanceRulesSchema>;
