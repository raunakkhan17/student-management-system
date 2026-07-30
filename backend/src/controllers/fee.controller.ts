import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import { auditFromRequest, redact } from '@/services/audit.service';
import * as concessionService from '@/services/fee/concession.service';
import * as configService from '@/services/fee/fee-config.service';
import * as invoiceService from '@/services/fee/invoice.service';
import * as paymentService from '@/services/fee/payment.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { sendExport } from '@/utils/export';
import { buildListQuery } from '@/utils/pagination';
import type {
  ApplyLateFeesInput,
  BulkInvoiceInput,
  CreateFeeStructureInput,
  CreateInvoiceInput,
  RecordPaymentInput,
} from '@/validators/fee.validator';

const MODULE = 'FEES' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

// ------------------------------------------------------------- Fee categories

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: ['name', 'type', 'createdAt'],
    defaultSortBy: 'name',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await configService.listFeeCategories(query, {
    type: req.query['type'] as never,
    isActive: req.query['isActive'] as boolean | undefined,
  });

  sendPaginated(res, items, pagination, 'Fee categories retrieved successfully');
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await configService.createFeeCategory(req.body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'FeeCategory',
    entityId: category.id,
    description: `Created fee category ${category.name}`,
    newValue: redact(category),
  });

  sendCreated(res, category, 'Fee category created successfully');
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const category = await configService.updateFeeCategory(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'FeeCategory',
    entityId: id,
    description: `Updated fee category ${category.name}`,
    newValue: redact(category),
  });

  sendSuccess(res, category, 'Fee category updated successfully');
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await configService.deleteFeeCategory(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'FeeCategory',
    entityId: id,
    description: 'Deleted a fee category',
  });

  sendSuccess(res, null, 'Fee category deleted successfully');
});

// ------------------------------------------------------------ Fee structures

export const listStructures = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: ['name', 'totalAmount', 'createdAt'],
    defaultSortBy: 'name',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await configService.listFeeStructures(query, {
    academicYearId: req.query['academicYearId'] as string | undefined,
    classId: req.query['classId'] as string | undefined,
    isActive: req.query['isActive'] as boolean | undefined,
  });

  sendPaginated(res, items, pagination, 'Fee structures retrieved successfully');
});

export const getStructure = asyncHandler(async (req: Request, res: Response) => {
  const structure = await configService.getFeeStructure(paramId(req));
  sendSuccess(res, structure, 'Fee structure retrieved successfully');
});

export const createStructure = asyncHandler(async (req: Request, res: Response) => {
  const structure = await configService.createFeeStructure(req.body as CreateFeeStructureInput);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'FeeStructure',
    entityId: structure.id,
    description: `Created fee structure ${structure.name} (${String(structure.totalAmount)})`,
    newValue: redact({ name: structure.name, totalAmount: structure.totalAmount }),
  });

  sendCreated(res, structure, 'Fee structure created successfully');
});

export const updateStructure = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const structure = await configService.updateFeeStructure(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'FeeStructure',
    entityId: id,
    description: `Updated fee structure ${structure.name}`,
    newValue: redact({ name: structure.name, totalAmount: structure.totalAmount }),
  });

  sendSuccess(res, structure, 'Fee structure updated successfully');
});

export const deleteStructure = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await configService.deleteFeeStructure(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'FeeStructure',
    entityId: id,
    description: 'Deleted a fee structure',
  });

  sendSuccess(res, null, 'Fee structure deleted successfully');
});

// -------------------------------------------------------------------- Invoices

export const listInvoices = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = buildListQuery(req.query, {
    allowedSortFields: ['issueDate', 'dueDate', 'totalAmount', 'balanceAmount'],
    defaultSortBy: 'issueDate',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await invoiceService.listInvoices(user, query, {
    studentId: req.query['studentId'] as string | undefined,
    academicYearId: req.query['academicYearId'] as string | undefined,
    classId: req.query['classId'] as string | undefined,
    sectionId: req.query['sectionId'] as string | undefined,
    status: req.query['status'] as never,
    issuedFrom: req.query['issuedFrom'] as Date | undefined,
    issuedTo: req.query['issuedTo'] as Date | undefined,
    onlyOutstanding: req.query['onlyOutstanding'] as boolean | undefined,
  });

  sendPaginated(res, items, pagination, 'Invoices retrieved successfully');
});

export const getInvoice = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const invoice = await invoiceService.getInvoice(user, paramId(req));
  sendSuccess(res, invoice, 'Invoice retrieved successfully');
});

export const createInvoice = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const invoice = await invoiceService.createInvoice(req.body as CreateInvoiceInput, user.id);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Invoice',
    entityId: invoice.id,
    description: `Issued invoice ${invoice.invoiceNumber} for ${String(invoice.totalAmount)}`,
    newValue: redact({
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      studentId: invoice.studentId,
    }),
  });

  sendCreated(res, invoice, 'Invoice issued successfully');
});

export const createBulkInvoices = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const body = req.body as BulkInvoiceInput;

  const result = await invoiceService.createBulkInvoices(body, user.id);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Invoice',
    description: `Issued ${result.created} invoice(s) in bulk`,
    newValue: redact({ ...body, ...result }),
  });

  sendCreated(res, result, `Issued ${result.created} invoice(s)`);
});

export const updateInvoice = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const invoice = await invoiceService.updateInvoice(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Invoice',
    entityId: id,
    description: `Updated invoice ${invoice.invoiceNumber}`,
    newValue: redact(req.body),
  });

  sendSuccess(res, invoice, 'Invoice updated successfully');
});

export const deleteInvoice = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await invoiceService.deleteInvoice(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Invoice',
    entityId: id,
    description: 'Deleted an invoice',
  });

  sendSuccess(res, null, 'Invoice deleted successfully');
});

export const markOverdue = asyncHandler(async (req: Request, res: Response) => {
  const count = await invoiceService.markOverdueInvoices();

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Invoice',
    description: `Marked ${count} invoice(s) overdue`,
  });

  sendSuccess(res, { updated: count }, `${count} invoice(s) marked overdue`);
});

export const getOutstanding = asyncHandler(async (req: Request, res: Response) => {
  const summary = await invoiceService.getOutstandingSummary(
    req.query['academicYearId'] as string | undefined,
  );
  sendSuccess(res, summary, 'Outstanding fees retrieved successfully');
});

// -------------------------------------------------------------------- Payments

export const recordPayment = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const payment = await paymentService.recordPayment(req.body as RecordPaymentInput, user.id);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Payment',
    entityId: payment.id,
    description: `Collected ${String(payment.amount)} against ${payment.invoice.invoiceNumber} — receipt ${payment.receiptNumber}`,
    newValue: redact({
      receiptNumber: payment.receiptNumber,
      amount: payment.amount,
      method: payment.method,
    }),
  });

  sendCreated(res, payment, `Payment recorded — receipt ${payment.receiptNumber}`);
});

export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = buildListQuery(req.query, {
    allowedSortFields: ['paidAt', 'amount'],
    defaultSortBy: 'paidAt',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await paymentService.listPayments(user, query, {
    studentId: req.query['studentId'] as string | undefined,
    invoiceId: req.query['invoiceId'] as string | undefined,
    method: req.query['method'] as never,
    paidFrom: req.query['paidFrom'] as Date | undefined,
    paidTo: req.query['paidTo'] as Date | undefined,
  });

  sendPaginated(res, items, pagination, 'Payments retrieved successfully');
});

export const getReceipt = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const receipt = await paymentService.getReceipt(user, paramId(req));
  sendSuccess(res, receipt, 'Receipt retrieved successfully');
});

export const refundPayment = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);
  const { reason } = req.body as { reason: string };

  const payment = await paymentService.refundPayment(id, reason, user.id);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Payment',
    entityId: id,
    description: `Refunded ${String(payment.amount)} on receipt ${payment.receiptNumber}`,
    newValue: redact({ reason }),
  });

  sendSuccess(res, payment, 'Payment refunded successfully');
});

// --------------------------------------------------------------------- Reports

export const getCollectionSummary = asyncHandler(async (req: Request, res: Response) => {
  const summary = await paymentService.getCollectionSummary({
    academicYearId: req.query['academicYearId'] as string | undefined,
    from: req.query['from'] as Date | undefined,
    to: req.query['to'] as Date | undefined,
  });

  sendSuccess(res, summary, 'Collection summary retrieved successfully');
});

export const getCollectionTrend = asyncHandler(async (req: Request, res: Response) => {
  const to = req.query['to'] ? new Date(`${String(req.query['to'])}T23:59:59.999Z`) : new Date();
  const from = req.query['from']
    ? new Date(`${String(req.query['from'])}T00:00:00.000Z`)
    : new Date(to.getTime() - 29 * 86_400_000);

  const trend = await paymentService.getCollectionTrend(from, to);
  sendSuccess(res, trend, 'Collection trend retrieved successfully');
});

export const exportCollectionReport = asyncHandler(async (req: Request, res: Response) => {
  const format = (req.query['format'] as 'csv' | 'xlsx' | undefined) ?? 'xlsx';

  const rows = await paymentService.getPaymentReportRows({
    academicYearId: req.query['academicYearId'] as string | undefined,
    classId: req.query['classId'] as string | undefined,
    from: req.query['from'] as Date | undefined,
    to: req.query['to'] as Date | undefined,
  });

  await auditFromRequest(req, {
    action: 'EXPORT',
    module: MODULE,
    entityType: 'Payment',
    description: `Exported ${rows.length} payment record(s)`,
  });

  await sendExport(
    res,
    rows,
    `fee-collection-${new Date().toISOString().slice(0, 10)}`,
    format,
    'Collection',
  );
});

export const exportOutstandingReport = asyncHandler(async (req: Request, res: Response) => {
  const format = (req.query['format'] as 'csv' | 'xlsx' | undefined) ?? 'xlsx';

  const rows = await paymentService.getOutstandingReportRows({
    academicYearId: req.query['academicYearId'] as string | undefined,
    classId: req.query['classId'] as string | undefined,
  });

  await auditFromRequest(req, {
    action: 'EXPORT',
    module: MODULE,
    entityType: 'Invoice',
    description: `Exported ${rows.length} outstanding invoice(s)`,
  });

  await sendExport(
    res,
    rows,
    `outstanding-fees-${new Date().toISOString().slice(0, 10)}`,
    format,
    'Outstanding',
  );
});

// -------------------------------------------------------- Scholarships/discounts

export const listScholarships = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: ['name', 'value'],
    defaultSortBy: 'name',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await concessionService.listScholarships(query, {
    academicYearId: req.query['academicYearId'] as string | undefined,
    isActive: req.query['isActive'] as boolean | undefined,
  });

  sendPaginated(res, items, pagination, 'Scholarships retrieved successfully');
});

export const createScholarship = asyncHandler(async (req: Request, res: Response) => {
  const scholarship = await concessionService.createScholarship(req.body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Scholarship',
    entityId: scholarship.id,
    description: `Created scholarship ${scholarship.name}`,
    newValue: redact(scholarship),
  });

  sendCreated(res, scholarship, 'Scholarship created successfully');
});

export const updateScholarship = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const scholarship = await concessionService.updateScholarship(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Scholarship',
    entityId: id,
    description: `Updated scholarship ${scholarship.name}`,
    newValue: redact(scholarship),
  });

  sendSuccess(res, scholarship, 'Scholarship updated successfully');
});

export const deleteScholarship = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await concessionService.deleteScholarship(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Scholarship',
    entityId: id,
    description: 'Deleted a scholarship',
  });

  sendSuccess(res, null, 'Scholarship deleted successfully');
});

export const awardScholarship = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const award = await concessionService.awardScholarship(req.body, user.id);

  await auditFromRequest(req, {
    action: 'APPROVE',
    module: MODULE,
    entityType: 'StudentScholarship',
    entityId: award.id,
    description: `Awarded ${award.scholarship.name} to ${award.student.admissionNumber}`,
    newValue: redact(req.body),
  });

  sendCreated(res, award, 'Scholarship awarded successfully');
});

export const revokeScholarship = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await concessionService.revokeScholarshipAward(id);

  await auditFromRequest(req, {
    action: 'REJECT',
    module: MODULE,
    entityType: 'StudentScholarship',
    entityId: id,
    description: 'Revoked a scholarship award',
  });

  sendSuccess(res, null, 'Scholarship award revoked');
});

export const listDiscounts = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: ['name', 'value'],
    defaultSortBy: 'name',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await concessionService.listDiscounts(query, {
    academicYearId: req.query['academicYearId'] as string | undefined,
    isActive: req.query['isActive'] as boolean | undefined,
  });

  sendPaginated(res, items, pagination, 'Discounts retrieved successfully');
});

export const createDiscount = asyncHandler(async (req: Request, res: Response) => {
  const discount = await concessionService.createDiscount(req.body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Discount',
    entityId: discount.id,
    description: `Created discount ${discount.name}`,
    newValue: redact(discount),
  });

  sendCreated(res, discount, 'Discount created successfully');
});

export const updateDiscount = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const discount = await concessionService.updateDiscount(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Discount',
    entityId: id,
    description: `Updated discount ${discount.name}`,
    newValue: redact(discount),
  });

  sendSuccess(res, discount, 'Discount updated successfully');
});

export const deleteDiscount = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await concessionService.deleteDiscount(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Discount',
    entityId: id,
    description: 'Deleted a discount',
  });

  sendSuccess(res, null, 'Discount deleted successfully');
});

export const awardDiscount = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const award = await concessionService.awardDiscount(req.body, user.id);

  await auditFromRequest(req, {
    action: 'APPROVE',
    module: MODULE,
    entityType: 'StudentDiscount',
    entityId: award.id,
    description: `Applied ${award.discount.name} to ${award.student.admissionNumber}`,
    newValue: redact(req.body),
  });

  sendCreated(res, award, 'Discount applied successfully');
});

export const revokeDiscount = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await concessionService.revokeDiscountAward(id);

  await auditFromRequest(req, {
    action: 'REJECT',
    module: MODULE,
    entityType: 'StudentDiscount',
    entityId: id,
    description: 'Revoked a discount award',
  });

  sendSuccess(res, null, 'Discount award revoked');
});

export const getStudentConcessions = asyncHandler(async (req: Request, res: Response) => {
  const concessions = await concessionService.listStudentConcessions(
    req.params['studentId'] as string,
    req.query['academicYearId'] as string | undefined,
  );
  sendSuccess(res, concessions, 'Concessions retrieved successfully');
});

// -------------------------------------------------------------- Late fee rules

export const listLateFeeRules = asyncHandler(async (_req: Request, res: Response) => {
  const rules = await configService.listLateFeeRules();
  sendSuccess(res, rules, 'Late fee rules retrieved successfully');
});

export const createLateFeeRule = asyncHandler(async (req: Request, res: Response) => {
  const rule = await configService.createLateFeeRule(req.body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'LateFeeRule',
    entityId: rule.id,
    description: `Created late fee rule ${rule.name}`,
    newValue: redact(rule),
  });

  sendCreated(res, rule, 'Late fee rule created successfully');
});

export const updateLateFeeRule = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const rule = await configService.updateLateFeeRule(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'LateFeeRule',
    entityId: id,
    description: `Updated late fee rule ${rule.name}`,
    newValue: redact(rule),
  });

  sendSuccess(res, rule, 'Late fee rule updated successfully');
});

export const deleteLateFeeRule = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await configService.deleteLateFeeRule(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'LateFeeRule',
    entityId: id,
    description: 'Deleted a late fee rule',
  });

  sendSuccess(res, null, 'Late fee rule deleted successfully');
});

export const applyLateFees = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as ApplyLateFeesInput;
  const result = await configService.applyLateFees(body);

  // A dry run changes nothing, so it is not worth an audit entry.
  if (!body.dryRun) {
    await auditFromRequest(req, {
      action: 'UPDATE',
      module: MODULE,
      entityType: 'Invoice',
      description: `Applied late fees to ${result.affected} invoice(s), totalling ${String(result.totalCharged)}`,
      newValue: redact({ ruleId: body.ruleId, affected: result.affected }),
    });
  }

  sendSuccess(
    res,
    result,
    body.dryRun
      ? `${result.affected} invoice(s) would be charged`
      : `Late fees applied to ${result.affected} invoice(s)`,
  );
});
