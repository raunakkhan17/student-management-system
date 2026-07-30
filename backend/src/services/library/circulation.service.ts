import { Prisma, type BookTransactionStatus } from '@prisma/client';
import QRCode from 'qrcode';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import type { AuthenticatedUser } from '@/types/auth';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';
import { notify } from '@/services/notification.service';
import type {
  IssueBookInput,
  LibrarySettingsInput,
  RenewBookInput,
  ReserveBookInput,
  ReturnBookInput,
} from '@/validators/library.validator';

const SETTINGS_KEY = 'library.circulation';

/** Defaults used until an administrator saves library settings. */
const DEFAULT_SETTINGS: LibrarySettingsInput = {
  finePerDay: 5,
  maxIssueDays: 14,
  maxRenewals: 2,
  maxBooksPerMember: 5,
  lostBookMultiplier: 2,
};

export async function getLibrarySettings(): Promise<LibrarySettingsInput> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return DEFAULT_SETTINGS;

  // Stored as JSON, so merge over the defaults to tolerate partial records.
  return { ...DEFAULT_SETTINGS, ...(row.value as Partial<LibrarySettingsInput>) };
}

export async function saveLibrarySettings(
  input: LibrarySettingsInput,
): Promise<LibrarySettingsInput> {
  await prisma.systemSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: {
      key: SETTINGS_KEY,
      value: input,
      category: 'library',
      description: 'Loan period, fines and borrowing limits',
    },
    update: { value: input },
  });

  return input;
}

const transactionInclude = {
  bookCopy: {
    select: {
      id: true,
      accessionNumber: true,
      status: true,
      condition: true,
      price: true,
      book: {
        select: {
          id: true,
          title: true,
          isbn: true,
          authors: { select: { author: { select: { name: true } } } },
        },
      },
    },
  },
  member: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      studentProfile: { select: { admissionNumber: true, class: { select: { name: true } } } },
      teacherProfile: { select: { employeeId: true } },
    },
  },
  issuedBy: { select: { firstName: true, lastName: true } },
  returnedTo: { select: { firstName: true, lastName: true } },
} satisfies Prisma.BookTransactionInclude;

export type TransactionRecord = Prisma.BookTransactionGetPayload<{
  include: typeof transactionInclude;
}>;

/** Days a loan is overdue, floored at zero. */
function daysOverdue(dueDate: Date, asOf: Date = new Date()): number {
  const due = new Date(dueDate);
  due.setUTCHours(23, 59, 59, 999);
  if (asOf <= due) return 0;
  return Math.floor((asOf.getTime() - due.getTime()) / 86_400_000) + 1;
}

/** Fine owed on a loan as of now. */
export function calculateFine(
  dueDate: Date,
  finePerDay: number,
  asOf: Date = new Date(),
): Prisma.Decimal {
  const overdue = daysOverdue(dueDate, asOf);
  return new Prisma.Decimal(overdue * finePerDay).toDecimalPlaces(2);
}

/**
 * Issues a copy to a member.
 *
 * The copy status and the book's `availableCopies` counter are updated in the
 * same transaction as the loan, so the catalogue count can never drift from the
 * physical reality of which copies are out.
 */
export async function issueBook(
  input: IssueBookInput,
  issuedById: string,
): Promise<TransactionRecord> {
  const settings = await getLibrarySettings();

  return prisma.$transaction(async (tx) => {
    const member = await tx.user.findFirst({
      where: { id: input.memberId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });

    if (!member) throw new NotFoundError('Member');

    // --- Borrowing limit ---
    const activeLoans = await tx.bookTransaction.count({
      where: { memberId: input.memberId, status: { in: ['ACTIVE', 'OVERDUE'] } },
    });

    if (activeLoans >= settings.maxBooksPerMember) {
      throw new ConflictError(
        `This member already has ${activeLoans} book(s) out; the limit is ${settings.maxBooksPerMember}.`,
        [{ field: 'memberId', message: 'Borrowing limit reached' }],
      );
    }

    // --- Unpaid fines block further borrowing ---
    const unpaidFines = await tx.bookTransaction.aggregate({
      where: { memberId: input.memberId, finePaid: false, fineAmount: { gt: 0 } },
      _sum: { fineAmount: true },
    });

    const owed = unpaidFines._sum.fineAmount;
    if (owed && owed.greaterThan(0)) {
      throw new ConflictError(
        `This member owes ${owed.toFixed(2)} in fines. Settle them before issuing another book.`,
        [{ field: 'memberId', message: `Outstanding fines: ${owed.toFixed(2)}` }],
      );
    }

    // --- Copy selection ---
    let copyId = input.bookCopyId ?? null;

    if (!copyId) {
      if (!input.bookId) {
        throw new BadRequestError('Choose a copy or a title to issue', [
          { field: 'bookId', message: 'Provide bookCopyId or bookId' },
        ]);
      }

      const available = await tx.bookCopy.findFirst({
        where: { bookId: input.bookId, status: 'AVAILABLE', deletedAt: null },
        orderBy: { accessionNumber: 'asc' },
        select: { id: true },
      });

      if (!available) {
        throw new ConflictError('No copies of this title are available');
      }

      copyId = available.id;
    }

    const copy = await tx.bookCopy.findFirst({
      where: { id: copyId, deletedAt: null },
      select: { id: true, bookId: true, status: true },
    });

    if (!copy) throw new NotFoundError('Book copy');

    if (copy.status !== 'AVAILABLE') {
      throw new ConflictError(`This copy is ${copy.status.toLowerCase()} and cannot be issued`);
    }

    // --- Reservation courtesy check ---
    const reservation = await tx.bookReservation.findFirst({
      where: {
        bookId: copy.bookId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        userId: { not: input.memberId },
      },
      orderBy: { reservedAt: 'asc' },
      select: { id: true },
    });

    if (reservation) {
      throw new ConflictError(
        'Another member has this title reserved. Fulfil or cancel that reservation first.',
        [{ field: 'bookCopyId', message: 'Reserved for another member' }],
      );
    }

    const issueDate = new Date();
    const dueDate =
      input.dueDate ?? new Date(issueDate.getTime() + settings.maxIssueDays * 86_400_000);

    const transaction = await tx.bookTransaction.create({
      data: {
        bookCopyId: copy.id,
        memberId: input.memberId,
        type: 'ISSUE',
        status: 'ACTIVE',
        issueDate,
        dueDate,
        issuedById,
        remarks: input.remarks ?? null,
      },
    });

    await tx.bookCopy.update({ where: { id: copy.id }, data: { status: 'ISSUED' } });

    await tx.book.update({
      where: { id: copy.bookId },
      data: { availableCopies: { decrement: 1 } },
    });

    // Fulfil the member's own reservation, if they had one.
    await tx.bookReservation.updateMany({
      where: { bookId: copy.bookId, userId: input.memberId, status: { in: ['PENDING', 'READY'] } },
      data: { status: 'FULFILLED' },
    });

    return tx.bookTransaction.findUniqueOrThrow({
      where: { id: transaction.id },
      include: transactionInclude,
    });
  });
}

/**
 * Returns a loan, calculating any fine.
 *
 * A lost book is charged the replacement cost (price × multiplier) instead of a
 * per-day fine, and its copy is retired rather than made available again.
 */
export async function returnBook(
  transactionId: string,
  input: ReturnBookInput,
  receivedById: string,
  canWaiveFine: boolean,
): Promise<TransactionRecord> {
  const settings = await getLibrarySettings();

  if (input.waiveFine && !canWaiveFine) {
    throw new ForbiddenError('You are not permitted to waive fines');
  }

  // Set inside the transaction when a queued reservation becomes collectable.
  // The notification is sent after the commit, so a mail failure cannot roll the
  // return back and nobody is told about a copy that was never released.
  let promotedUserId: string | null = null;
  let promotedBookId: string | null = null;

  const loanRecord = await prisma.$transaction(async (tx) => {
    const loan = await tx.bookTransaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        status: true,
        dueDate: true,
        bookCopyId: true,
        bookCopy: { select: { bookId: true, price: true } },
      },
    });

    if (!loan) throw new NotFoundError('Loan');

    if (loan.status === 'RETURNED' || loan.status === 'LOST') {
      throw new ConflictError(`This loan is already closed (${loan.status.toLowerCase()})`);
    }

    const returnDate = new Date();

    let fineAmount: Prisma.Decimal;
    let newStatus: BookTransactionStatus;

    if (input.markAsLost) {
      // Replacement cost; falls back to a flat charge when no price is recorded.
      const price = loan.bookCopy.price ?? new Prisma.Decimal(500);
      fineAmount = price.mul(settings.lostBookMultiplier).toDecimalPlaces(2);
      newStatus = 'LOST';
    } else {
      fineAmount = calculateFine(loan.dueDate, settings.finePerDay, returnDate);
      newStatus = 'RETURNED';
    }

    if (input.waiveFine) {
      fineAmount = new Prisma.Decimal(0);
    }

    await tx.bookTransaction.update({
      where: { id: transactionId },
      data: {
        type: input.markAsLost ? 'LOST' : 'RETURN',
        status: newStatus,
        returnDate,
        fineAmount,
        // A zero fine is settled by definition.
        finePaid: fineAmount.isZero(),
        returnedToById: receivedById,
        remarks: input.remarks ?? null,
      },
    });

    if (input.markAsLost) {
      await tx.bookCopy.update({ where: { id: loan.bookCopyId }, data: { status: 'LOST' } });
      // A lost copy never returns to the shelf, so totalCopies drops too.
      await tx.book.update({
        where: { id: loan.bookCopy.bookId },
        data: { totalCopies: { decrement: 1 } },
      });
    } else {
      const isDamaged = input.condition === 'POOR';

      await tx.bookCopy.update({
        where: { id: loan.bookCopyId },
        data: {
          status: isDamaged ? 'DAMAGED' : 'AVAILABLE',
          ...(input.condition ? { condition: input.condition } : {}),
        },
      });

      // A damaged copy is off the shelf, so it does not become available again.
      if (!isDamaged) {
        await tx.book.update({
          where: { id: loan.bookCopy.bookId },
          data: { availableCopies: { increment: 1 } },
        });

        // Promote the longest-waiting reservation to READY.
        const nextInQueue = await tx.bookReservation.findFirst({
          where: {
            bookId: loan.bookCopy.bookId,
            status: 'PENDING',
            expiresAt: { gt: returnDate },
          },
          orderBy: { reservedAt: 'asc' },
          select: { id: true, userId: true },
        });

        if (nextInQueue) {
          await tx.bookReservation.update({
            where: { id: nextInQueue.id },
            data: { status: 'READY' },
          });

          promotedUserId = nextInQueue.userId;
          promotedBookId = loan.bookCopy.bookId;
        }
      }
    }

    return tx.bookTransaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: transactionInclude,
    });
  });

  if (promotedUserId) {
    await notify({
      userIds: [promotedUserId],
      type: 'LIBRARY_DUE',
      title: 'Reserved book is available',
      body: 'A copy of the book you reserved is now ready for collection.',
      link: '/library',
      entityType: 'Book',
      entityId: promotedBookId,
    });
  }

  return loanRecord;
}

/** Extends a loan, subject to the renewal cap and no pending reservations. */
export async function renewBook(
  transactionId: string,
  input: RenewBookInput,
): Promise<TransactionRecord> {
  const settings = await getLibrarySettings();

  return prisma.$transaction(async (tx) => {
    const loan = await tx.bookTransaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        status: true,
        dueDate: true,
        renewCount: true,
        bookCopy: { select: { bookId: true } },
      },
    });

    if (!loan) throw new NotFoundError('Loan');

    if (loan.status !== 'ACTIVE' && loan.status !== 'OVERDUE') {
      throw new ConflictError('Only an open loan can be renewed');
    }

    if (loan.renewCount >= settings.maxRenewals) {
      throw new ConflictError(
        `This loan has already been renewed ${loan.renewCount} time(s); the limit is ${settings.maxRenewals}.`,
        [{ field: 'id', message: 'Renewal limit reached' }],
      );
    }

    // Someone else waiting takes precedence over a renewal.
    const waiting = await tx.bookReservation.count({
      where: {
        bookId: loan.bookCopy.bookId,
        status: { in: ['PENDING', 'READY'] },
        expiresAt: { gt: new Date() },
      },
    });

    if (waiting > 0) {
      throw new ConflictError('Another member is waiting for this title, so it cannot be renewed');
    }

    // Extend from the current due date, not from today — a late renewal should
    // not silently forgive the overdue period.
    const base = loan.dueDate > new Date() ? loan.dueDate : new Date();
    const dueDate = input.dueDate ?? new Date(base.getTime() + settings.maxIssueDays * 86_400_000);

    await tx.bookTransaction.update({
      where: { id: transactionId },
      data: {
        type: 'RENEW',
        status: 'ACTIVE',
        dueDate,
        renewCount: { increment: 1 },
        remarks: input.remarks ?? null,
      },
    });

    return tx.bookTransaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: transactionInclude,
    });
  });
}

/** Places a hold on a title that has no free copies. */
export async function reserveBook(input: ReserveBookInput, userId: string) {
  const book = await prisma.book.findFirst({
    where: { id: input.bookId, deletedAt: null },
    select: { id: true, title: true, availableCopies: true },
  });

  if (!book) throw new NotFoundError('Book');

  if (book.availableCopies > 0) {
    throw new ConflictError('Copies of this title are available, so it can be borrowed directly', [
      { field: 'bookId', message: `${book.availableCopies} copy(ies) on the shelf` },
    ]);
  }

  const existing = await prisma.bookReservation.findFirst({
    where: { bookId: input.bookId, userId, status: { in: ['PENDING', 'READY'] } },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError('You already have a reservation for this title');
  }

  return prisma.bookReservation.create({
    data: {
      bookId: input.bookId,
      userId,
      expiresAt: new Date(Date.now() + input.holdDays * 86_400_000),
      status: 'PENDING',
    },
    include: {
      book: { select: { id: true, title: true, isbn: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  });
}

export async function cancelReservation(id: string, user: AuthenticatedUser): Promise<void> {
  const reservation = await prisma.bookReservation.findUnique({
    where: { id },
    select: { userId: true, status: true },
  });

  if (!reservation) throw new NotFoundError('Reservation');

  // Members may cancel their own; librarians and admins may cancel any.
  const isOwner = reservation.userId === user.id;
  const isStaff = ['LIBRARIAN', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);

  if (!isOwner && !isStaff) {
    throw new ForbiddenError('You can only cancel your own reservations');
  }

  await prisma.bookReservation.update({ where: { id }, data: { status: 'CANCELLED' } });
}

/** Settles an outstanding fine. */
export async function payFine(transactionId: string, remarks?: string): Promise<TransactionRecord> {
  const loan = await prisma.bookTransaction.findUnique({
    where: { id: transactionId },
    select: { fineAmount: true, finePaid: true },
  });

  if (!loan) throw new NotFoundError('Loan');

  if (loan.finePaid || loan.fineAmount.isZero()) {
    throw new ConflictError('There is no outstanding fine on this loan');
  }

  return prisma.bookTransaction.update({
    where: { id: transactionId },
    data: { finePaid: true, remarks: remarks ?? null },
    include: transactionInclude,
  });
}

export interface TransactionFilters {
  memberId?: string;
  bookId?: string;
  status?: BookTransactionStatus[];
  onlyOverdue?: boolean;
  issuedFrom?: Date;
  issuedTo?: Date;
}

export async function listTransactions(
  user: AuthenticatedUser,
  query: ListQueryOptions,
  filters: TransactionFilters,
): Promise<PaginatedData<TransactionRecord>> {
  // Members see only their own borrowing history.
  const isStaff = ['LIBRARIAN', 'ADMIN', 'SUPER_ADMIN', 'TEACHER'].includes(user.role);

  const where: Prisma.BookTransactionWhereInput = {
    ...(isStaff ? {} : { memberId: user.id }),
    ...(filters.memberId ? { memberId: filters.memberId } : {}),
    ...(filters.bookId ? { bookCopy: { bookId: filters.bookId } } : {}),
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(filters.onlyOverdue
      ? { status: { in: ['ACTIVE', 'OVERDUE'] }, dueDate: { lt: new Date() } }
      : {}),
    ...(filters.issuedFrom || filters.issuedTo
      ? {
          issueDate: {
            ...(filters.issuedFrom ? { gte: filters.issuedFrom } : {}),
            ...(filters.issuedTo ? { lte: filters.issuedTo } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { bookCopy: { accessionNumber: { contains: query.search, mode: 'insensitive' } } },
            { bookCopy: { book: { title: { contains: query.search, mode: 'insensitive' } } } },
            { member: { firstName: { contains: query.search, mode: 'insensitive' } } },
            { member: { lastName: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.bookTransaction.findMany({
      where,
      include: transactionInclude,
      orderBy: { issueDate: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.bookTransaction.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

/**
 * Flags overdue loans and accrues their fines.
 *
 * Idempotent — recalculates from the due date each time rather than adding to
 * whatever was there before, so repeated runs cannot double-charge.
 */
export async function refreshOverdueLoans(): Promise<{ flagged: number; totalFines: string }> {
  const settings = await getLibrarySettings();
  const now = new Date();

  const overdue = await prisma.bookTransaction.findMany({
    where: { status: { in: ['ACTIVE', 'OVERDUE'] }, dueDate: { lt: now } },
    select: { id: true, dueDate: true, finePaid: true },
  });

  let totalFines = new Prisma.Decimal(0);

  await prisma.$transaction(
    overdue.map((loan) => {
      const fine = calculateFine(loan.dueDate, settings.finePerDay, now);
      totalFines = totalFines.add(fine);

      return prisma.bookTransaction.update({
        where: { id: loan.id },
        data: { status: 'OVERDUE', fineAmount: fine, finePaid: fine.isZero() },
      });
    }),
  );

  return { flagged: overdue.length, totalFines: totalFines.toFixed(2) };
}

/** Circulation counters for the librarian dashboard. */
export async function getLibraryStats() {
  const now = new Date();

  const [titles, copies, issued, overdue, reservations, fines] = await Promise.all([
    prisma.book.count({ where: { deletedAt: null } }),
    prisma.bookCopy.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.bookTransaction.count({ where: { status: { in: ['ACTIVE', 'OVERDUE'] } } }),
    prisma.bookTransaction.count({
      where: { status: { in: ['ACTIVE', 'OVERDUE'] }, dueDate: { lt: now } },
    }),
    prisma.bookReservation.count({ where: { status: { in: ['PENDING', 'READY'] } } }),
    prisma.bookTransaction.aggregate({
      where: { finePaid: false, fineAmount: { gt: 0 } },
      _sum: { fineAmount: true },
    }),
  ]);

  const copyCounts = copies.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.status] = row._count._all;
    return accumulator;
  }, {});

  return {
    titles,
    totalCopies: Object.values(copyCounts).reduce((sum, value) => sum + value, 0),
    availableCopies: copyCounts['AVAILABLE'] ?? 0,
    issuedCopies: copyCounts['ISSUED'] ?? 0,
    lostCopies: copyCounts['LOST'] ?? 0,
    damagedCopies: copyCounts['DAMAGED'] ?? 0,
    activeLoans: issued,
    overdueLoans: overdue,
    activeReservations: reservations,
    unpaidFines: (fines._sum.fineAmount ?? new Prisma.Decimal(0)).toFixed(2),
  };
}

/** Generates the QR payload printed on a copy's spine label. */
export async function generateCopyQrCode(copyId: string): Promise<string> {
  const copy = await prisma.bookCopy.findFirst({
    where: { id: copyId, deletedAt: null },
    select: { id: true, accessionNumber: true, book: { select: { title: true, isbn: true } } },
  });

  if (!copy) throw new NotFoundError('Book copy');

  // Encodes the accession number so a scan resolves to exactly one copy.
  const payload = JSON.stringify({
    type: 'educore.bookCopy',
    id: copy.id,
    accession: copy.accessionNumber,
    isbn: copy.book.isbn,
  });

  const dataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 1 });

  // Cached on the row so repeat prints do not regenerate it.
  await prisma.bookCopy.update({ where: { id: copyId }, data: { qrCode: copy.accessionNumber } });

  return dataUrl;
}

/** Members with books out, for the reminder screen. */
/**
 * Finds borrowers by name, email or admission/employee number.
 *
 * Only roles that can hold a loan are returned, and the count of books already
 * out is included so the issue desk can see the limit before submitting.
 */
export async function searchMembers(search: string | undefined, limit = 20) {
  const term = search?.trim();

  const members = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      role: { in: ['STUDENT', 'TEACHER', 'LIBRARIAN', 'ADMIN', 'ACCOUNTANT'] },
      ...(term
        ? {
            OR: [
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
              { studentProfile: { admissionNumber: { contains: term, mode: 'insensitive' } } },
              { teacherProfile: { employeeId: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      studentProfile: { select: { admissionNumber: true, class: { select: { name: true } } } },
      teacherProfile: { select: { employeeId: true } },
      _count: { select: { bookTransactions: { where: { status: { in: ['ACTIVE', 'OVERDUE'] } } } } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: limit,
  });

  return members.map((member) => ({
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    role: member.role,
    identifier: member.studentProfile?.admissionNumber ?? member.teacherProfile?.employeeId ?? null,
    className: member.studentProfile?.class?.name ?? null,
    onLoan: member._count.bookTransactions,
  }));
}

export async function getMemberLoanSummary(memberId: string) {
  const settings = await getLibrarySettings();

  const loans = await prisma.bookTransaction.findMany({
    where: { memberId, status: { in: ['ACTIVE', 'OVERDUE'] } },
    include: transactionInclude,
    orderBy: { dueDate: 'asc' },
  });

  return {
    limit: settings.maxBooksPerMember,
    onLoan: loans.length,
    loans: loans.map((loan) => ({
      ...loan,
      daysOverdue: daysOverdue(loan.dueDate),
      accruedFine: calculateFine(loan.dueDate, settings.finePerDay).toFixed(2),
    })),
  };
}
