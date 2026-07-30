import type { ListQueryParams } from './api';
import type { UserRole } from './enums';

export type BookCopyStatus = 'AVAILABLE' | 'ISSUED' | 'RESERVED' | 'LOST' | 'DAMAGED' | 'WITHDRAWN';

export type BookCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR';

export type BookTransactionStatus = 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'LOST' | 'CANCELLED';

export type ReservationStatus = 'PENDING' | 'READY' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED';

export const BOOK_COPY_STATUS_LABELS: Record<BookCopyStatus, string> = {
  AVAILABLE: 'Available',
  ISSUED: 'On loan',
  RESERVED: 'Reserved',
  LOST: 'Lost',
  DAMAGED: 'Damaged',
  WITHDRAWN: 'Withdrawn',
};

export const BOOK_CONDITION_LABELS: Record<BookCondition, string> = {
  NEW: 'New',
  GOOD: 'Good',
  FAIR: 'Fair',
  POOR: 'Poor',
};

export const TRANSACTION_STATUS_LABELS: Record<BookTransactionStatus, string> = {
  ACTIVE: 'On loan',
  RETURNED: 'Returned',
  OVERDUE: 'Overdue',
  LOST: 'Lost',
  CANCELLED: 'Cancelled',
};

// -------------------------------------------------------------------- Taxonomy

export interface BookCategory {
  id: string;
  name: string;
  code: string;
  description: string | null;
}

export interface Author {
  id: string;
  name: string;
  biography: string | null;
}

export interface Publisher {
  id: string;
  name: string;
  address: string | null;
  contact: string | null;
  email: string | null;
}

export interface Shelf {
  id: string;
  code: string;
  name: string;
  location: string | null;
  capacity: number;
}

// ----------------------------------------------------------------------- Books

export interface BookAuthorLink {
  author: { id: string; name: string };
}

export interface Book {
  id: string;
  title: string;
  isbn: string;
  categoryId: string;
  publisherId: string | null;
  edition: string | null;
  publishYear: number | null;
  language: string;
  pages: number | null;
  description: string | null;
  coverImageId: string | null;
  totalCopies: number;
  availableCopies: number;
  category: { id: string; name: string; code: string };
  publisher: { id: string; name: string } | null;
  authors: BookAuthorLink[];
  _count: { copies: number; reservations: number };
}

export interface BookCopy {
  id: string;
  bookId: string;
  accessionNumber: string;
  qrCode: string | null;
  shelfId: string | null;
  status: BookCopyStatus;
  condition: BookCondition;
  purchaseDate: string | null;
  price: string | null;
  shelf: { id: string; code: string; name: string } | null;
}

export interface BookCopyListItem extends BookCopy {
  book: { id: string; title: string; isbn: string };
}

export interface BookReservationSummary {
  id: string;
  userId: string;
  reservedAt: string;
  expiresAt: string;
  status: ReservationStatus;
  user: { firstName: string; lastName: string };
}

export interface BookDetail extends Book {
  copies: BookCopy[];
  reservations: BookReservationSummary[];
}

// ----------------------------------------------------------------- Circulation

export interface LibraryMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  /** Admission number for students, employee id for staff. */
  identifier: string | null;
  className: string | null;
  onLoan: number;
}

export interface BookTransaction {
  id: string;
  bookCopyId: string;
  memberId: string;
  type: 'ISSUE' | 'RETURN' | 'RENEW' | 'LOST';
  status: BookTransactionStatus;
  issueDate: string;
  dueDate: string;
  returnDate: string | null;
  renewCount: number;
  fineAmount: string;
  finePaid: boolean;
  remarks: string | null;
  bookCopy: {
    id: string;
    accessionNumber: string;
    status: BookCopyStatus;
    condition: BookCondition;
    price: string | null;
    book: { id: string; title: string; isbn: string; authors: { author: { name: string } }[] };
  };
  member: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
    studentProfile: { admissionNumber: string; class: { name: string } | null } | null;
    teacherProfile: { employeeId: string } | null;
  };
  issuedBy: { firstName: string; lastName: string } | null;
  returnedTo: { firstName: string; lastName: string } | null;
}

export interface BookReservation {
  id: string;
  bookId: string;
  userId: string;
  reservedAt: string;
  expiresAt: string;
  status: ReservationStatus;
  book: { id: string; title: string; isbn: string };
  user: { firstName: string; lastName: string };
}

export interface MemberLoanSummary {
  limit: number;
  onLoan: number;
  loans: (BookTransaction & { daysOverdue: number; accruedFine: string })[];
}

export interface LibraryStats {
  titles: number;
  totalCopies: number;
  availableCopies: number;
  issuedCopies: number;
  lostCopies: number;
  damagedCopies: number;
  activeLoans: number;
  overdueLoans: number;
  activeReservations: number;
  unpaidFines: string;
}

export interface LibrarySettings {
  finePerDay: number;
  maxIssueDays: number;
  maxRenewals: number;
  maxBooksPerMember: number;
  lostBookMultiplier: number;
}

// -------------------------------------------------------------------- Payloads

export interface BookPayload {
  title: string;
  isbn: string;
  categoryId: string;
  publisherId?: string | null;
  authorIds: string[];
  authorNames: string[];
  edition?: string;
  publishYear?: number;
  language: string;
  pages?: number;
  description?: string;
}

export interface AddCopiesPayload {
  count: number;
  accessionNumbers: string[];
  shelfId?: string | null;
  condition: BookCondition;
  purchaseDate?: string;
  price?: number;
}

export interface UpdateCopyPayload {
  shelfId?: string | null;
  status?: BookCopyStatus;
  condition?: BookCondition;
  price?: number;
}

export interface IssueBookPayload {
  bookCopyId?: string | null;
  bookId?: string | null;
  memberId: string;
  dueDate?: string;
  remarks?: string;
}

export interface ReturnBookPayload {
  markAsLost: boolean;
  condition?: BookCondition;
  waiveFine: boolean;
  remarks?: string;
}

export interface RenewBookPayload {
  dueDate?: string;
  remarks?: string;
}

export interface BookQuery extends ListQueryParams {
  categoryId?: string;
  publisherId?: string;
  authorId?: string;
  language?: string;
  onlyAvailable?: boolean;
}

export interface CopyQuery extends ListQueryParams {
  bookId?: string;
  shelfId?: string;
  status?: string;
}

export interface TransactionQuery extends ListQueryParams {
  memberId?: string;
  bookId?: string;
  status?: string;
  onlyOverdue?: boolean;
  issuedFrom?: string;
  issuedTo?: string;
}
