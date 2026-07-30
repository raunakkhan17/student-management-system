import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import { auditFromRequest, redact } from '@/services/audit.service';
import * as catalogueService from '@/services/library/catalogue.service';
import * as circulationService from '@/services/library/circulation.service';
import { hasPermission } from '@/services/permission.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { sendExport } from '@/utils/export';
import { buildListQuery } from '@/utils/pagination';
import type {
  AddCopiesInput,
  CreateBookInput,
  IssueBookInput,
  RenewBookInput,
  ReserveBookInput,
  ReturnBookInput,
} from '@/validators/library.validator';

const MODULE = 'LIBRARY' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

function listQuery(req: Request, defaultSortBy: string) {
  return buildListQuery(req.query, {
    allowedSortFields: ['name', 'code', 'title', 'accessionNumber', 'issueDate', 'createdAt'],
    defaultSortBy,
    defaultSortOrder: 'asc',
  });
}

// ------------------------------------------------------------------ Taxonomy

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await catalogueService.listCategories(listQuery(req, 'name'));
  sendPaginated(res, items, pagination, 'Categories retrieved successfully');
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await catalogueService.createCategory(req.body);
  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'BookCategory',
    entityId: category.id,
    description: `Created book category ${category.name}`,
    newValue: redact(category),
  });
  sendCreated(res, category, 'Category created successfully');
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await catalogueService.deleteCategory(id);
  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'BookCategory',
    entityId: id,
    description: 'Deleted a book category',
  });
  sendSuccess(res, null, 'Category deleted successfully');
});

export const listAuthors = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await catalogueService.listAuthors(listQuery(req, 'name'));
  sendPaginated(res, items, pagination, 'Authors retrieved successfully');
});

export const createAuthor = asyncHandler(async (req: Request, res: Response) => {
  const author = await catalogueService.createAuthor(req.body);
  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Author',
    entityId: author.id,
    description: `Added author ${author.name}`,
  });
  sendCreated(res, author, 'Author added successfully');
});

export const listPublishers = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await catalogueService.listPublishers(listQuery(req, 'name'));
  sendPaginated(res, items, pagination, 'Publishers retrieved successfully');
});

export const createPublisher = asyncHandler(async (req: Request, res: Response) => {
  const publisher = await catalogueService.createPublisher(req.body);
  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Publisher',
    entityId: publisher.id,
    description: `Added publisher ${publisher.name}`,
  });
  sendCreated(res, publisher, 'Publisher added successfully');
});

export const listShelves = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await catalogueService.listShelves(listQuery(req, 'code'));
  sendPaginated(res, items, pagination, 'Shelves retrieved successfully');
});

export const createShelf = asyncHandler(async (req: Request, res: Response) => {
  const shelf = await catalogueService.createShelf(req.body);
  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Shelf',
    entityId: shelf.id,
    description: `Added shelf ${shelf.code}`,
  });
  sendCreated(res, shelf, 'Shelf added successfully');
});

export const deleteShelf = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await catalogueService.deleteShelf(id);
  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Shelf',
    entityId: id,
    description: 'Deleted a shelf',
  });
  sendSuccess(res, null, 'Shelf deleted successfully');
});

// ---------------------------------------------------------------------- Books

export const listBooks = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: ['title', 'isbn', 'publishYear', 'createdAt'],
    defaultSortBy: 'title',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await catalogueService.listBooks(query, {
    categoryId: req.query['categoryId'] as string | undefined,
    publisherId: req.query['publisherId'] as string | undefined,
    authorId: req.query['authorId'] as string | undefined,
    language: req.query['language'] as string | undefined,
    onlyAvailable: req.query['onlyAvailable'] as boolean | undefined,
  });

  sendPaginated(res, items, pagination, 'Books retrieved successfully');
});

export const getBook = asyncHandler(async (req: Request, res: Response) => {
  const book = await catalogueService.getBook(paramId(req));
  sendSuccess(res, book, 'Book retrieved successfully');
});

export const createBook = asyncHandler(async (req: Request, res: Response) => {
  const book = await catalogueService.createBook(req.body as CreateBookInput);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Book',
    entityId: book.id,
    description: `Catalogued "${book.title}" (${book.isbn})`,
    newValue: redact({ title: book.title, isbn: book.isbn }),
  });

  sendCreated(res, book, 'Book catalogued successfully');
});

export const updateBook = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const book = await catalogueService.updateBook(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Book',
    entityId: id,
    description: `Updated "${book.title}"`,
    newValue: redact(req.body),
  });

  sendSuccess(res, book, 'Book updated successfully');
});

export const deleteBook = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await catalogueService.deleteBook(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Book',
    entityId: id,
    description: 'Withdrew a title from the catalogue',
  });

  sendSuccess(res, null, 'Book withdrawn successfully');
});

// ----------------------------------------------------------------- Book copies

export const listCopies = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: ['accessionNumber', 'status', 'createdAt'],
    defaultSortBy: 'accessionNumber',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await catalogueService.listCopies(query, {
    bookId: req.query['bookId'] as string | undefined,
    shelfId: req.query['shelfId'] as string | undefined,
    status: req.query['status'] as never,
  });

  sendPaginated(res, items, pagination, 'Copies retrieved successfully');
});

export const addCopies = asyncHandler(async (req: Request, res: Response) => {
  const bookId = paramId(req);
  const body = req.body as AddCopiesInput;

  const book = await catalogueService.addCopies(bookId, body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'BookCopy',
    entityId: bookId,
    description: `Registered ${body.accessionNumbers.length || body.count} copy(ies) of "${book.title}"`,
  });

  sendCreated(res, book, 'Copies registered successfully');
});

export const updateCopy = asyncHandler(async (req: Request, res: Response) => {
  const copyId = req.params['copyId'] as string;
  const copy = await catalogueService.updateCopy(copyId, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'BookCopy',
    entityId: copyId,
    description: `Updated copy ${copy.accessionNumber}`,
    newValue: redact(req.body),
  });

  sendSuccess(res, copy, 'Copy updated successfully');
});

export const getCopyQrCode = asyncHandler(async (req: Request, res: Response) => {
  const copyId = req.params['copyId'] as string;
  const dataUrl = await circulationService.generateCopyQrCode(copyId);
  sendSuccess(res, { dataUrl }, 'QR code generated successfully');
});

// --------------------------------------------------------------- Circulation

export const issueBook = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const loan = await circulationService.issueBook(req.body as IssueBookInput, user.id);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'BookTransaction',
    entityId: loan.id,
    description: `Issued "${loan.bookCopy.book.title}" (${loan.bookCopy.accessionNumber}) to ${loan.member.firstName} ${loan.member.lastName}`,
    newValue: redact({ dueDate: loan.dueDate }),
  });

  sendCreated(res, loan, `Issued — due ${loan.dueDate.toISOString().slice(0, 10)}`);
});

export const returnBook = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);
  const body = req.body as ReturnBookInput;

  // Waiving a fine is an approval-level action, so the permission is resolved
  // here rather than trusted from the request.
  const canWaive = await hasPermission(user.role, 'LIBRARY', 'APPROVE');

  const loan = await circulationService.returnBook(id, body, user.id, canWaive);

  await auditFromRequest(req, {
    action: body.markAsLost ? 'UPDATE' : 'UPDATE',
    module: MODULE,
    entityType: 'BookTransaction',
    entityId: id,
    description: body.markAsLost
      ? `Recorded "${loan.bookCopy.book.title}" as lost — charged ${loan.fineAmount.toFixed(2)}`
      : `Returned "${loan.bookCopy.book.title}"${loan.fineAmount.isZero() ? '' : ` with a fine of ${loan.fineAmount.toFixed(2)}`}`,
    newValue: redact({ fineAmount: loan.fineAmount, status: loan.status }),
  });

  sendSuccess(
    res,
    loan,
    loan.fineAmount.isZero()
      ? 'Returned successfully'
      : `Returned — fine of ${loan.fineAmount.toFixed(2)} recorded`,
  );
});

export const renewBook = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const loan = await circulationService.renewBook(id, req.body as RenewBookInput);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'BookTransaction',
    entityId: id,
    description: `Renewed "${loan.bookCopy.book.title}" to ${loan.dueDate.toISOString().slice(0, 10)}`,
  });

  sendSuccess(res, loan, `Renewed — now due ${loan.dueDate.toISOString().slice(0, 10)}`);
});

export const reserveBook = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const reservation = await circulationService.reserveBook(req.body as ReserveBookInput, user.id);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'BookReservation',
    entityId: reservation.id,
    description: `Reserved "${reservation.book.title}"`,
  });

  sendCreated(res, reservation, 'Reservation placed successfully');
});

export const cancelReservation = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);

  await circulationService.cancelReservation(id, user);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'BookReservation',
    entityId: id,
    description: 'Cancelled a reservation',
  });

  sendSuccess(res, null, 'Reservation cancelled');
});

export const payFine = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const { remarks } = req.body as { remarks?: string };

  const loan = await circulationService.payFine(id, remarks);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'BookTransaction',
    entityId: id,
    description: `Collected a fine of ${loan.fineAmount.toFixed(2)}`,
  });

  sendSuccess(res, loan, 'Fine settled successfully');
});

export const listTransactions = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = buildListQuery(req.query, {
    allowedSortFields: ['issueDate', 'dueDate', 'returnDate'],
    defaultSortBy: 'issueDate',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await circulationService.listTransactions(user, query, {
    memberId: req.query['memberId'] as string | undefined,
    bookId: req.query['bookId'] as string | undefined,
    status: req.query['status'] as never,
    onlyOverdue: req.query['onlyOverdue'] as boolean | undefined,
    issuedFrom: req.query['issuedFrom'] as Date | undefined,
    issuedTo: req.query['issuedTo'] as Date | undefined,
  });

  sendPaginated(res, items, pagination, 'Circulation history retrieved successfully');
});

export const refreshOverdue = asyncHandler(async (req: Request, res: Response) => {
  const result = await circulationService.refreshOverdueLoans();

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'BookTransaction',
    description: `Flagged ${result.flagged} overdue loan(s), fines totalling ${result.totalFines}`,
  });

  sendSuccess(res, result, `${result.flagged} loan(s) flagged overdue`);
});

export const getStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await circulationService.getLibraryStats();
  sendSuccess(res, stats, 'Library statistics retrieved successfully');
});

export const getMyLoans = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const summary = await circulationService.getMemberLoanSummary(user.id);
  sendSuccess(res, summary, 'Loans retrieved successfully');
});

export const searchMembers = asyncHandler(async (req: Request, res: Response) => {
  const members = await circulationService.searchMembers(req.query['search'] as string | undefined);
  sendSuccess(res, members, 'Members retrieved successfully');
});

export const getMemberLoans = asyncHandler(async (req: Request, res: Response) => {
  const summary = await circulationService.getMemberLoanSummary(
    req.params['memberId'] as string,
  );
  sendSuccess(res, summary, 'Loans retrieved successfully');
});

// ------------------------------------------------------------------ Settings

export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await circulationService.getLibrarySettings();
  sendSuccess(res, settings, 'Library settings retrieved successfully');
});

export const saveSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await circulationService.saveLibrarySettings(req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'SystemSetting',
    description: 'Updated library circulation rules',
    newValue: redact(settings),
  });

  sendSuccess(res, settings, 'Library settings saved successfully');
});

export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const format = (req.query['format'] as 'csv' | 'xlsx' | undefined) ?? 'xlsx';
  const rows = await catalogueService.getLibraryReportRows();

  await auditFromRequest(req, {
    action: 'EXPORT',
    module: MODULE,
    entityType: 'Book',
    description: `Exported ${rows.length} catalogue record(s)`,
  });

  await sendExport(res, rows, `library-catalogue-${new Date().toISOString().slice(0, 10)}`, format, 'Catalogue');
});
