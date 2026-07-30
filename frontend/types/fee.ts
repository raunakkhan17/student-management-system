import type { ListQueryParams } from './api';

export type FeeCategoryType =
  | 'TUITION'
  | 'HOSTEL'
  | 'TRANSPORT'
  | 'LIBRARY'
  | 'EXAMINATION'
  | 'MISCELLANEOUS';

export type InvoiceStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED'
  | 'WAIVED';

export type InstallmentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'WAIVED';

export type PaymentMethod =
  | 'CASH'
  | 'CHEQUE'
  | 'CARD'
  | 'NET_BANKING'
  | 'UPI'
  | 'BANK_TRANSFER'
  | 'DEMAND_DRAFT';

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export type ConcessionType = 'PERCENTAGE' | 'FIXED';

export const FEE_CATEGORY_TYPE_LABELS: Record<FeeCategoryType, string> = {
  TUITION: 'Tuition',
  HOSTEL: 'Hostel',
  TRANSPORT: 'Transport',
  LIBRARY: 'Library',
  EXAMINATION: 'Examination',
  MISCELLANEOUS: 'Miscellaneous',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  PARTIALLY_PAID: 'Partly paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
  WAIVED: 'Waived',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  NET_BANKING: 'Net banking',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank transfer',
  DEMAND_DRAFT: 'Demand draft',
};

export const CONCESSION_TYPE_LABELS: Record<ConcessionType, string> = {
  PERCENTAGE: 'Percentage',
  FIXED: 'Fixed amount',
};

export interface FeeCategory {
  id: string;
  name: string;
  type: FeeCategoryType;
  description: string | null;
  isRecurring: boolean;
  isActive: boolean;
}

export interface FeeStructureItem {
  id: string;
  feeCategoryId: string;
  amount: string;
  isOptional: boolean;
  dueDate: string | null;
  feeCategory: { id: string; name: string; type: FeeCategoryType };
}

export interface FeeStructure {
  id: string;
  name: string;
  academicYearId: string;
  classId: string | null;
  courseId: string | null;
  totalAmount: string;
  description: string | null;
  isActive: boolean;
  academicYear: { id: string; name: string };
  class: { id: string; name: string; code: string } | null;
  course: { id: string; name: string; code: string } | null;
  items: FeeStructureItem[];
  _count: { invoices: number };
}

export interface InvoiceItem {
  id: string;
  feeCategoryId: string;
  description: string;
  amount: string;
  feeCategory: { id: string; name: string; type: FeeCategoryType };
}

export interface Installment {
  id: string;
  installmentNumber: number;
  amount: string;
  paidAmount: string;
  dueDate: string;
  status: InstallmentStatus;
}

export interface PaymentSummary {
  id: string;
  receiptNumber: string;
  amount: string;
  method: PaymentMethod;
  status: PaymentStatus;
  paidAt: string;
  transactionRef: string | null;
  remarks: string | null;
  collectedBy: { firstName: string; lastName: string } | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  studentId: string;
  academicYearId: string;
  feeStructureId: string | null;
  issueDate: string;
  dueDate: string;
  subtotal: string;
  discountAmount: string;
  scholarshipAmount: string;
  lateFeeAmount: string;
  totalAmount: string;
  paidAmount: string;
  balanceAmount: string;
  status: InvoiceStatus;
  notes: string | null;
  student: {
    id: string;
    admissionNumber: string;
    rollNumber: string | null;
    user: { firstName: string; lastName: string; email: string };
    class: { id: string; name: string } | null;
    section: { id: string; name: string } | null;
  };
  academicYear: { id: string; name: string };
  feeStructure: { id: string; name: string } | null;
  items: InvoiceItem[];
  installments: Installment[];
  payments: PaymentSummary[];
  createdBy: { firstName: string; lastName: string } | null;
}

export interface PaymentRecord {
  id: string;
  receiptNumber: string;
  amount: string;
  method: PaymentMethod;
  status: PaymentStatus;
  paidAt: string;
  transactionRef: string | null;
  remarks: string | null;
  invoice: {
    id: string;
    invoiceNumber: string;
    totalAmount: string;
    paidAmount: string;
    balanceAmount: string;
    status: InvoiceStatus;
  };
  student: {
    id: string;
    admissionNumber: string;
    user: { firstName: string; lastName: string };
    class: { name: string } | null;
    section: { name: string } | null;
  };
  installment: {
    id: string;
    installmentNumber: number;
    amount: string;
    dueDate: string;
  } | null;
  collectedBy: { firstName: string; lastName: string } | null;
}

export interface Receipt {
  institution: {
    name: string;
    code: string;
    email: string;
    phone: string;
    logoId: string | null;
    currency: string;
  } | null;
  payment: PaymentRecord;
}

export interface CollectionSummary {
  collectedInPeriod: string;
  paymentCount: number;
  totalBilled: string;
  totalCollected: string;
  totalOutstanding: string;
  outstandingInvoiceCount: number;
  invoiceCount: number;
  collectionRate: number | null;
  byMethod: { method: PaymentMethod; amount: string; count: number }[];
}

export interface CollectionTrendPoint {
  date: string;
  amount: string;
  count: number;
}

export interface OutstandingRow {
  studentId: string;
  admissionNumber: string;
  name: string;
  className: string | null;
  sectionName: string | null;
  invoiceCount: number;
  outstanding: string;
}

export interface Scholarship {
  id: string;
  name: string;
  description: string | null;
  type: ConcessionType;
  value: string;
  academicYearId: string | null;
  isActive: boolean;
  _count: { awards: number };
}

export interface Discount {
  id: string;
  name: string;
  reason: string | null;
  type: ConcessionType;
  value: string;
  academicYearId: string | null;
  isActive: boolean;
  _count: { awards: number };
}

export interface LateFeeRule {
  id: string;
  name: string;
  gracePeriodDays: number;
  chargeType: ConcessionType;
  chargeValue: string;
  isRecurringDaily: boolean;
  maxCharge: string | null;
  isActive: boolean;
}

export interface LateFeePreview {
  dryRun: boolean;
  affected: number;
  totalCharged: string;
  preview: { invoiceId: string; invoiceNumber: string; daysOverdue: number; charge: string }[];
}

// ------------------------------------------------------------------- Payloads

export interface FeeCategoryPayload {
  name: string;
  type: FeeCategoryType;
  description?: string;
  isRecurring: boolean;
  isActive: boolean;
}

export interface FeeStructurePayload {
  name: string;
  academicYearId: string;
  classId?: string | null;
  courseId?: string | null;
  description?: string;
  isActive: boolean;
  items: {
    feeCategoryId: string;
    amount: number;
    isOptional: boolean;
    dueDate?: string;
  }[];
}

export interface CreateInvoicePayload {
  studentId: string;
  academicYearId: string;
  feeStructureId?: string | null;
  issueDate: string;
  dueDate: string;
  notes?: string;
  items: { feeCategoryId: string; description: string; amount: number }[];
  installments: { amount: number; dueDate: string }[];
  applyConcessions: boolean;
}

export interface BulkInvoicePayload {
  feeStructureId: string;
  academicYearId: string;
  classId: string;
  sectionId?: string | null;
  issueDate: string;
  dueDate: string;
  notes?: string;
  installmentCount: number;
  applyConcessions: boolean;
}

export interface RecordPaymentPayload {
  invoiceId: string;
  installmentId?: string | null;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  transactionRef?: string;
  remarks?: string;
}

export interface InvoiceQuery extends ListQueryParams {
  studentId?: string;
  academicYearId?: string;
  classId?: string;
  sectionId?: string;
  status?: string;
  onlyOutstanding?: boolean;
}

export interface PaymentQuery extends ListQueryParams {
  studentId?: string;
  invoiceId?: string;
  method?: PaymentMethod;
  paidFrom?: string;
  paidTo?: string;
}
