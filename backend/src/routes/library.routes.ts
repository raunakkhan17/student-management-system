import { Router } from 'express';
import { z } from 'zod';
import * as controller from '@/controllers/library.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { paginationQuerySchema, uuidParamSchema } from '@/validators/common.validator';
import {
  addCopiesSchema,
  bookQuerySchema,
  copyQuerySchema,
  createAuthorSchema,
  createBookCategorySchema,
  createBookSchema,
  createPublisherSchema,
  createShelfSchema,
  issueBookSchema,
  librarySettingsSchema,
  payFineSchema,
  renewBookSchema,
  reserveBookSchema,
  returnBookSchema,
  transactionQuerySchema,
  updateBookSchema,
  updateCopySchema,
} from '@/validators/library.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('LIBRARY', 'VIEW');
const canCreate = requirePermission('LIBRARY', 'CREATE');
const canEdit = requirePermission('LIBRARY', 'EDIT');
const canDelete = requirePermission('LIBRARY', 'DELETE');
const canExport = requirePermission('LIBRARY', 'EXPORT');
const canAssign = requirePermission('LIBRARY', 'ASSIGN');
const canApprove = requirePermission('LIBRARY', 'APPROVE');

const copyOnlyParam = z.object({ copyId: z.string().uuid() });
const memberParam = z.object({ memberId: z.string().uuid() });

// ------------------------------------------------------------------- Overview
router.get('/stats', canView, controller.getStats);
router.get('/my-loans', canView, controller.getMyLoans);
router.get('/members', canAssign, controller.searchMembers);
router.get('/members/:memberId/loans', canView, validate({ params: memberParam }), controller.getMemberLoans);

// ------------------------------------------------------------------- Settings
router
  .route('/settings')
  .get(canView, controller.getSettings)
  .put(requirePermission('SETTINGS', 'EDIT'), validate({ body: librarySettingsSchema }), controller.saveSettings);

// ------------------------------------------------------------------ Taxonomy
router
  .route('/categories')
  .get(canView, validate({ query: paginationQuerySchema }), controller.listCategories)
  .post(canCreate, validate({ body: createBookCategorySchema }), controller.createCategory);

router.delete('/categories/:id', canDelete, validate({ params: uuidParamSchema }), controller.deleteCategory);

router
  .route('/authors')
  .get(canView, validate({ query: paginationQuerySchema }), controller.listAuthors)
  .post(canCreate, validate({ body: createAuthorSchema }), controller.createAuthor);

router
  .route('/publishers')
  .get(canView, validate({ query: paginationQuerySchema }), controller.listPublishers)
  .post(canCreate, validate({ body: createPublisherSchema }), controller.createPublisher);

router
  .route('/shelves')
  .get(canView, validate({ query: paginationQuerySchema }), controller.listShelves)
  .post(canCreate, validate({ body: createShelfSchema }), controller.createShelf);

router.delete('/shelves/:id', canDelete, validate({ params: uuidParamSchema }), controller.deleteShelf);

// ---------------------------------------------------------------- Circulation
router.post('/issue', canAssign, validate({ body: issueBookSchema }), controller.issueBook);
router.post('/reserve', canView, validate({ body: reserveBookSchema }), controller.reserveBook);
router.post('/overdue/refresh', canEdit, controller.refreshOverdue);

router.get('/transactions', canView, validate({ query: transactionQuerySchema }), controller.listTransactions);

router.post(
  '/transactions/:id/return',
  canAssign,
  validate({ params: uuidParamSchema, body: returnBookSchema }),
  controller.returnBook,
);

router.post(
  '/transactions/:id/renew',
  canAssign,
  validate({ params: uuidParamSchema, body: renewBookSchema }),
  controller.renewBook,
);

router.post(
  '/transactions/:id/pay-fine',
  canApprove,
  validate({ params: uuidParamSchema, body: payFineSchema }),
  controller.payFine,
);

router.post(
  '/reservations/:id/cancel',
  canView,
  validate({ params: uuidParamSchema }),
  controller.cancelReservation,
);

// ---------------------------------------------------------------------- Copies
router.get('/copies', canView, validate({ query: copyQuerySchema }), controller.listCopies);

router.patch(
  '/copies/:copyId',
  canEdit,
  validate({ params: copyOnlyParam, body: updateCopySchema }),
  controller.updateCopy,
);

router.get('/copies/:copyId/qr', canView, validate({ params: copyOnlyParam }), controller.getCopyQrCode);

// --------------------------------------------------------------------- Reports
router.get('/reports/catalogue', canExport, controller.exportReport);

// ----------------------------------------------------------------------- Books
router
  .route('/books')
  .get(canView, validate({ query: bookQuerySchema }), controller.listBooks)
  .post(canCreate, validate({ body: createBookSchema }), controller.createBook);

router
  .route('/books/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getBook)
  .patch(canEdit, validate({ params: uuidParamSchema, body: updateBookSchema }), controller.updateBook)
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteBook);

router.post(
  '/books/:id/copies',
  canCreate,
  validate({ params: uuidParamSchema, body: addCopiesSchema }),
  controller.addCopies,
);

export default router;
