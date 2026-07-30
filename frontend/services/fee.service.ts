import { api, httpClient } from '@/lib/api-client';
import type { ListQueryParams, PaginatedData } from '@/types/api';
import type {
  BulkInvoicePayload,
  CollectionSummary,
  CollectionTrendPoint,
  CreateInvoicePayload,
  Discount,
  FeeCategory,
  FeeCategoryPayload,
  FeeStructure,
  FeeStructurePayload,
  Installment,
  Invoice,
  InvoiceQuery,
  InvoiceStatus,
  LateFeePreview,
  LateFeeRule,
  OutstandingRow,
  PaymentQuery,
  PaymentRecord,
  Receipt,
  RecordPaymentPayload,
  Scholarship,
} from '@/types/fee';

const BASE = '/fees';

export const feeService = {
  // Categories
  listCategories: (params: ListQueryParams) =>
    api.get<PaginatedData<FeeCategory>>(`${BASE}/categories`, { params }),
  createCategory: (payload: FeeCategoryPayload) =>
    api.post<FeeCategory>(`${BASE}/categories`, payload),
  updateCategory: (id: string, payload: Partial<FeeCategoryPayload>) =>
    api.patch<FeeCategory>(`${BASE}/categories/${id}`, payload),
  deleteCategory: (id: string) => api.delete<null>(`${BASE}/categories/${id}`),

  // Structures
  listStructures: (params: ListQueryParams & { academicYearId?: string; classId?: string }) =>
    api.get<PaginatedData<FeeStructure>>(`${BASE}/structures`, { params }),
  getStructure: (id: string) => api.get<FeeStructure>(`${BASE}/structures/${id}`),
  createStructure: (payload: FeeStructurePayload) =>
    api.post<FeeStructure>(`${BASE}/structures`, payload),
  updateStructure: (id: string, payload: Partial<FeeStructurePayload>) =>
    api.patch<FeeStructure>(`${BASE}/structures/${id}`, payload),
  deleteStructure: (id: string) => api.delete<null>(`${BASE}/structures/${id}`),

  // Invoices
  listInvoices: (params: InvoiceQuery) =>
    api.get<PaginatedData<Invoice>>(`${BASE}/invoices`, { params }),
  getInvoice: (id: string) => api.get<Invoice>(`${BASE}/invoices/${id}`),
  createInvoice: (payload: CreateInvoicePayload) => api.post<Invoice>(`${BASE}/invoices`, payload),
  createBulkInvoices: (payload: BulkInvoicePayload) =>
    api.post<{ created: number; skipped: { studentId: string; reason: string }[] }>(
      `${BASE}/invoices/bulk`,
      payload,
    ),
  updateInvoice: (id: string, payload: { dueDate?: string; notes?: string; status?: InvoiceStatus }) =>
    api.patch<Invoice>(`${BASE}/invoices/${id}`, payload),
  deleteInvoice: (id: string) => api.delete<null>(`${BASE}/invoices/${id}`),
  markOverdue: () => api.post<{ updated: number }>(`${BASE}/invoices/mark-overdue`),

  // Payments
  listPayments: (params: PaymentQuery) =>
    api.get<PaginatedData<PaymentRecord>>(`${BASE}/payments`, { params }),
  recordPayment: (payload: RecordPaymentPayload) =>
    api.post<PaymentRecord>(`${BASE}/payments`, payload),
  getReceipt: (id: string) => api.get<Receipt>(`${BASE}/payments/${id}/receipt`),
  refundPayment: (id: string, reason: string) =>
    api.post<PaymentRecord>(`${BASE}/payments/${id}/refund`, { reason }),

  // Insight
  getSummary: (params?: { academicYearId?: string; from?: string; to?: string }) =>
    api.get<CollectionSummary>(`${BASE}/summary`, { params: params ?? {} }),
  getTrend: (params?: { from?: string; to?: string }) =>
    api.get<CollectionTrendPoint[]>(`${BASE}/summary/trend`, { params: params ?? {} }),
  getOutstanding: (academicYearId?: string) =>
    api.get<OutstandingRow[]>(`${BASE}/outstanding`, {
      params: academicYearId ? { academicYearId } : {},
    }),

  // Concessions
  listScholarships: (params: ListQueryParams) =>
    api.get<PaginatedData<Scholarship>>(`${BASE}/scholarships`, { params }),
  createScholarship: (payload: {
    name: string;
    type: string;
    value: number;
    description?: string;
    academicYearId?: string | null;
    isActive: boolean;
  }) => api.post<Scholarship>(`${BASE}/scholarships`, payload),
  awardScholarship: (payload: {
    studentId: string;
    scholarshipId: string;
    academicYearId: string;
    awardedDate: string;
    remarks?: string;
  }) => api.post<unknown>(`${BASE}/scholarships/award`, payload),

  listDiscounts: (params: ListQueryParams) =>
    api.get<PaginatedData<Discount>>(`${BASE}/discounts`, { params }),
  createDiscount: (payload: {
    name: string;
    type: string;
    value: number;
    reason?: string;
    academicYearId?: string | null;
    isActive: boolean;
  }) => api.post<Discount>(`${BASE}/discounts`, payload),

  getStudentConcessions: (studentId: string, academicYearId?: string) =>
    api.get<{ scholarships: unknown[]; discounts: unknown[] }>(
      `${BASE}/students/${studentId}/concessions`,
      { params: academicYearId ? { academicYearId } : {} },
    ),

  // Late fees
  listLateFeeRules: () => api.get<LateFeeRule[]>(`${BASE}/late-fee-rules`),
  createLateFeeRule: (payload: {
    name: string;
    gracePeriodDays: number;
    chargeType: string;
    chargeValue: number;
    isRecurringDaily: boolean;
    maxCharge?: number;
    isActive: boolean;
  }) => api.post<LateFeeRule>(`${BASE}/late-fee-rules`, payload),
  applyLateFees: (ruleId: string, dryRun: boolean, academicYearId?: string) =>
    api.post<LateFeePreview>(`${BASE}/late-fees/apply`, {
      ruleId,
      dryRun,
      ...(academicYearId ? { academicYearId } : {}),
    }),

  /** Streams a file, so it bypasses the JSON envelope unwrapping. */
  exportReport: async (
    kind: 'collection' | 'outstanding',
    params: { academicYearId?: string; classId?: string; from?: string; to?: string; format: 'csv' | 'xlsx' },
  ) => {
    const response = await httpClient.get<Blob>(`${BASE}/reports/${kind}`, {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
};

export type { Installment };
