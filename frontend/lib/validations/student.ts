import { z } from 'zod';
import { BloodGroup, Gender } from '@/types/enums';

export const addressFormSchema = z.object({
  line1: z.string().trim().min(1, 'Address line 1 is required').max(200),
  line2: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(120).optional(),
  city: z.string().trim().min(1, 'City is required').max(80),
  state: z.string().trim().min(1, 'State is required').max(80),
  country: z.string().trim().min(1, 'Country is required').max(80),
  postalCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9\s-]{4,12}$/, 'Enter a valid postal code'),
});

const phoneField = z
  .string()
  .trim()
  .regex(/^[+]?[\d\s-]{7,20}$/, 'Enter a valid phone number');

const aadhaarField = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s/g, ''))
  .refine((value) => value === '' || /^\d{12}$/.test(value), 'Aadhaar must be 12 digits');

export const guardianFormSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'SIBLING', 'OTHER']),
  occupation: z.string().trim().max(120).optional(),
  organization: z.string().trim().max(120).optional(),
  phone: phoneField,
  alternatePhone: z.union([phoneField, z.literal('')]).optional(),
  email: z.union([z.string().trim().email('Enter a valid email address'), z.literal('')]).optional(),
  annualIncome: z.union([z.coerce.number().nonnegative(), z.literal('')]).optional(),
  aadhaarNumber: aadhaarField.optional(),
  qualification: z.string().trim().max(120).optional(),
  isPrimary: z.boolean(),
  createPortalAccount: z.boolean(),
});

export const studentFormSchema = z
  .object({
    // Identity
    firstName: z.string().trim().min(1, 'First name is required').max(80),
    lastName: z.string().trim().min(1, 'Last name is required').max(80),
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
    phone: z.union([phoneField, z.literal('')]).optional(),

    // Admission
    admissionNumber: z.string().trim().max(40).optional(),
    rollNumber: z.string().trim().max(20).optional(),
    admissionDate: z.string().min(1, 'Admission date is required'),

    // Placement
    academicYearId: z.string().uuid('Select an academic year'),
    classId: z.string().optional(),
    sectionId: z.string().optional(),

    // Personal
    gender: z.nativeEnum(Gender, { required_error: 'Select a gender' }),
    dateOfBirth: z.string().min(1, 'Date of birth is required'),
    bloodGroup: z.union([z.nativeEnum(BloodGroup), z.literal('')]).optional(),
    aadhaarNumber: aadhaarField.optional(),
    nationality: z.string().trim().min(1, 'Nationality is required').max(60),
    religion: z.string().trim().max(60).optional(),
    category: z.string().trim().max(60).optional(),
    motherTongue: z.string().trim().max(60).optional(),
    previousSchool: z.string().trim().max(160).optional(),

    // Emergency contact
    emergencyContactName: z.string().trim().min(1, 'Emergency contact name is required').max(120),
    emergencyContactPhone: phoneField,
    emergencyContactRelation: z
      .string()
      .trim()
      .min(1, 'State the relationship to the student')
      .max(60),

    // Addresses
    permanentAddress: addressFormSchema,
    sameAsPermanent: z.boolean(),
    currentAddress: addressFormSchema.partial().optional(),

    guardians: z.array(guardianFormSchema).max(4),

    createPortalAccount: z.boolean(),
  })
  .refine((data) => new Date(data.dateOfBirth) < new Date(), {
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

export type StudentFormValues = z.infer<typeof studentFormSchema>;
export type GuardianFormValues = z.infer<typeof guardianFormSchema>;
export type AddressFormValues = z.infer<typeof addressFormSchema>;

export const emptyAddress: AddressFormValues = {
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  state: '',
  country: 'India',
  postalCode: '',
};

export const emptyGuardian: GuardianFormValues = {
  firstName: '',
  lastName: '',
  relation: 'FATHER',
  occupation: '',
  organization: '',
  phone: '',
  alternatePhone: '',
  email: '',
  annualIncome: '',
  aadhaarNumber: '',
  qualification: '',
  isPrimary: true,
  createPortalAccount: false,
};
