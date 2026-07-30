import { Router } from 'express';
import { z } from 'zod';
import * as controller from '@/controllers/fee.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { paginationQuerySchema, uuidParamSchema } from '@/validators/common.validator';
import {
  applyLateFeesSchema,
  awardDiscountSchema,
  awardScholarshipSchema,
  bulkInvoiceSchema,
  collectionSummaryQuerySchema,
  createDiscountSchema,
  createFeeCategorySchema,
  createFeeStructureSchema,
  createInvoiceSchema,
  createLateFeeRuleSchema,
  createScholarshipSchema,
  feeCategoryQuerySchema,
  feeReportQuerySchema,
  feeStructureQuerySchema,
  invoiceQuerySchema,
  paymentQuerySchema,
  recordPaymentSchema,
  refundPaymentSchema,
  updateFeeCategorySchema,
  updateFeeStructureSchema,
  updateInvoiceSchema,
} from '@/validators/fee.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('FEES', 'VIEW');
const canCreate = requirePermission('FEES', 'CREATE');
const canEdit = requirePermission('FEES', 'EDIT');
const canDelete = requirePermission('FEES', 'DELETE');
const canExport = requirePermission('FEES', 'EXPORT');
const canApprove = requirePermission('FEES', 'APPROVE');

const studentIdParam = z.object({ studentId: z.string().uuid() });

// ------------------------------------------------------------- Fee categories
router
  .route('/categories')
  .get(canView, validate({ query: feeCategoryQuerySchema }), controller.listCategories)
  .post(canCreate, validate({ body: createFeeCategorySchema }), controller.createCategory);

router
  .route('/categories/:id')
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateFeeCategorySchema }),
    controller.updateCategory,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteCategory);

// ------------------------------------------------------------ Fee structures
router
  .route('/structures')
  .get(canView, validate({ query: feeStructureQuerySchema }), controller.listStructures)
  .post(canCreate, validate({ body: createFeeStructureSchema }), controller.createStructure);

router
  .route('/structures/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getStructure)
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateFeeStructureSchema }),
    controller.updateStructure,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteStructure);

// -------------------------------------------------------------------- Payments
router
  .route('/payments')
  .get(canView, validate({ query: paymentQuerySchema }), controller.listPayments)
  .post(canCreate, validate({ body: recordPaymentSchema }), controller.recordPayment);

router.get('/payments/:id/receipt', canView, validate({ params: uuidParamSchema }), controller.getReceipt);

router.post(
  '/payments/:id/refund',
  canApprove,
  validate({ params: uuidParamSchema, body: refundPaymentSchema }),
  controller.refundPayment,
);

// --------------------------------------------------------------------- Reports
router.get('/summary', canView, validate({ query: collectionSummaryQuerySchema }), controller.getCollectionSummary);
router.get('/summary/trend', canView, controller.getCollectionTrend);
router.get('/outstanding', canView, controller.getOutstanding);
router.get('/reports/collection', canExport, validate({ query: feeReportQuerySchema }), controller.exportCollectionReport);
router.get('/reports/outstanding', canExport, validate({ query: feeReportQuerySchema }), controller.exportOutstandingReport);

// ---------------------------------------------------------------- Scholarships
router
  .route('/scholarships')
  .get(canView, validate({ query: paginationQuerySchema }), controller.listScholarships)
  .post(canCreate, validate({ body: createScholarshipSchema }), controller.createScholarship);

router
  .route('/scholarships/:id')
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: createScholarshipSchema.partial() }),
    controller.updateScholarship,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteScholarship);

router.post('/scholarships/award', canApprove, validate({ body: awardScholarshipSchema }), controller.awardScholarship);
router.post('/scholarships/awards/:id/revoke', canApprove, validate({ params: uuidParamSchema }), controller.revokeScholarship);

// ------------------------------------------------------------------- Discounts
router
  .route('/discounts')
  .get(canView, validate({ query: paginationQuerySchema }), controller.listDiscounts)
  .post(canCreate, validate({ body: createDiscountSchema }), controller.createDiscount);

router
  .route('/discounts/:id')
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: createDiscountSchema.partial() }),
    controller.updateDiscount,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteDiscount);

router.post('/discounts/award', canApprove, validate({ body: awardDiscountSchema }), controller.awardDiscount);
router.post('/discounts/awards/:id/revoke', canApprove, validate({ params: uuidParamSchema }), controller.revokeDiscount);

router.get(
  '/students/:studentId/concessions',
  canView,
  validate({ params: studentIdParam }),
  controller.getStudentConcessions,
);

// -------------------------------------------------------------- Late fee rules
router
  .route('/late-fee-rules')
  .get(canView, controller.listLateFeeRules)
  .post(canCreate, validate({ body: createLateFeeRuleSchema }), controller.createLateFeeRule);

router
  .route('/late-fee-rules/:id')
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: createLateFeeRuleSchema.partial() }),
    controller.updateLateFeeRule,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteLateFeeRule);

router.post('/late-fees/apply', canApprove, validate({ body: applyLateFeesSchema }), controller.applyLateFees);

// -------------------------------------------------------------------- Invoices
// Declared last so every static segment above wins over `/invoices/:id`.
router
  .route('/invoices')
  .get(canView, validate({ query: invoiceQuerySchema }), controller.listInvoices)
  .post(canCreate, validate({ body: createInvoiceSchema }), controller.createInvoice);

router.post('/invoices/bulk', canCreate, validate({ body: bulkInvoiceSchema }), controller.createBulkInvoices);
router.post('/invoices/mark-overdue', canEdit, controller.markOverdue);

router
  .route('/invoices/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getInvoice)
  .patch(canEdit, validate({ params: uuidParamSchema, body: updateInvoiceSchema }), controller.updateInvoice)
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteInvoice);

export default router;
