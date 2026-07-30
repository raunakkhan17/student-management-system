import { BookCondition, BookCopyStatus } from '@prisma/client';
import { z } from 'zod';
import {
  csvToArray,
  dateOnlySchema,
  optionalString,
  paginationQuerySchema,
  requiredString,
} from './common.validator';

/** ISBN-10 or ISBN-13, hyphens and spaces tolerated. */
const isbnSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(
    z
      .string()
      .regex(/^(\d{9}[\dXx]|\d{13})$/, 'Enter a valid 10- or 13-digit ISBN'),
  );

const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(20)
  .regex(/^[A-Z0-9-]+$/, 'Use letters, numbers and dashes only');

// ------------------------------------------------------------------ Taxonomy

export const createBookCategorySchema = z.object({
  name: requiredString('Name', 120),
  code: codeSchema,
  description: optionalString(300),
});

export const createAuthorSchema = z.object({
  name: requiredString('Name', 160),
  biography: optionalString(2000),
});

export const createPublisherSchema = z.object({
  name: requiredString('Name', 160),
  address: optionalString(300),
  contact: optionalString(60),
  email: optionalString(160),
});

export const createShelfSchema = z.object({
  code: codeSchema,
  name: requiredString('Name', 120),
  location: optionalString(160),
  capacity: z.coerce.number().int().min(1).max(10_000).default(100),
});

// ---------------------------------------------------------------------- Books

export const createBookSchema = z.object({
  title: requiredString('Title', 300),
  isbn: isbnSchema,
  categoryId: z.string().uuid('Select a category'),
  publisherId: z.string().uuid().nullish(),
  authorIds: z.array(z.string().uuid()).max(10).default([]),
  /** Creates new author records for names not already in the catalogue. */
  authorNames: z.array(requiredString('Author name', 160)).max(10).default([]),
  edition: optionalString(60),
  publishYear: z.coerce.number().int().min(1400).max(2200).optional(),
  language: requiredString('Language', 60).default('English'),
  pages: z.coerce.number().int().min(1).max(20_000).optional(),
  description: optionalString(2000),
});

export const updateBookSchema = createBookSchema.partial().omit({ isbn: true });

export const bookQuerySchema = paginationQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  publisherId: z.string().uuid().optional(),
  authorId: z.string().uuid().optional(),
  language: z.string().trim().max(60).optional(),
  /** Only titles with at least one available copy. */
  onlyAvailable: z.coerce.boolean().default(false),
});

// ----------------------------------------------------------------- Book copies

export const addCopiesSchema = z.object({
  /** How many physical copies to register in one go. */
  count: z.coerce.number().int().min(1).max(100).default(1),
  /** Accession numbers are auto-generated when omitted. */
  accessionNumbers: z.array(requiredString('Accession number', 40)).max(100).default([]),
  shelfId: z.string().uuid().nullish(),
  condition: z.nativeEnum(BookCondition).default('NEW'),
  purchaseDate: dateOnlySchema.optional(),
  price: z.coerce.number().nonnegative().max(9_999_999).optional(),
});

export const updateCopySchema = z.object({
  shelfId: z.string().uuid().nullish(),
  status: z.nativeEnum(BookCopyStatus).optional(),
  condition: z.nativeEnum(BookCondition).optional(),
  price: z.coerce.number().nonnegative().max(9_999_999).optional(),
});

export const copyQuerySchema = paginationQuerySchema.extend({
  bookId: z.string().uuid().optional(),
  shelfId: z.string().uuid().optional(),
  status: csvToArray(z.nativeEnum(BookCopyStatus)),
});

// --------------------------------------------------------------- Circulation

export const issueBookSchema = z.object({
  /** Either a specific copy, or a title from which any available copy is drawn. */
  bookCopyId: z.string().uuid().nullish(),
  bookId: z.string().uuid().nullish(),
  memberId: z.string().uuid('Select a member'),
  /** Defaults to the library's configured loan period. */
  dueDate: dateOnlySchema.optional(),
  remarks: optionalString(300),
});

export const returnBookSchema = z.object({
  /** Recorded as lost rather than returned, which charges the replacement cost. */
  markAsLost: z.boolean().default(false),
  condition: z.nativeEnum(BookCondition).optional(),
  /** Waives the calculated fine — requires the APPROVE permission. */
  waiveFine: z.boolean().default(false),
  remarks: optionalString(300),
});

export const renewBookSchema = z.object({
  dueDate: dateOnlySchema.optional(),
  remarks: optionalString(300),
});

export const reserveBookSchema = z.object({
  bookId: z.string().uuid('Select a book'),
  /** How long the reservation is held once a copy frees up. */
  holdDays: z.coerce.number().int().min(1).max(30).default(3),
});

export const transactionQuerySchema = paginationQuerySchema.extend({
  memberId: z.string().uuid().optional(),
  bookId: z.string().uuid().optional(),
  status: csvToArray(
    z.enum(['ACTIVE', 'RETURNED', 'OVERDUE', 'LOST', 'CANCELLED']),
  ),
  /** Only loans that are past their due date and still out. */
  onlyOverdue: z.coerce.boolean().default(false),
  issuedFrom: dateOnlySchema.optional(),
  issuedTo: dateOnlySchema.optional(),
});

export const payFineSchema = z.object({
  remarks: optionalString(300),
});

/** Library-wide circulation rules, stored in system settings. */
export const librarySettingsSchema = z.object({
  finePerDay: z.coerce.number().nonnegative().max(10_000),
  maxIssueDays: z.coerce.number().int().min(1).max(365),
  maxRenewals: z.coerce.number().int().min(0).max(10),
  maxBooksPerMember: z.coerce.number().int().min(1).max(50),
  lostBookMultiplier: z.coerce.number().min(1).max(10),
});

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type AddCopiesInput = z.infer<typeof addCopiesSchema>;
export type IssueBookInput = z.infer<typeof issueBookSchema>;
export type ReturnBookInput = z.infer<typeof returnBookSchema>;
export type RenewBookInput = z.infer<typeof renewBookSchema>;
export type ReserveBookInput = z.infer<typeof reserveBookSchema>;
export type LibrarySettingsInput = z.infer<typeof librarySettingsSchema>;
