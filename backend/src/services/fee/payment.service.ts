import { Prisma, type PaymentMethod } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import type { AuthenticatedUser } from '@/types/auth';
import { BadRequestError, ConflictError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';
import { nextSequentialCode, withUniqueRetry } from '@/utils/sequence';
import type { RecordPaymentInput } from '@/validators/fee.validator';
import { money, sum, ZERO } from './money';

const paymentInclude = {
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      totalAmount: true,
      paidAmount: true,
      balanceAmount: true,
      status: true,
    },
  },
  student: {
    select: {
      id: true,
      admissionNumber: true,
      user: { select: { firstName: true, lastName: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  },
  installment: { select: { id: true, installmentNumber: true, amount: true, dueDate: true } },
  collectedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.PaymentInclude;

export type PaymentRecord = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

async function generateReceiptNumber(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const prefix = 'RCPT';
  const latest = await tx.payment.findFirst({
    where: { receiptNumber: { startsWith: `${prefix}/${year}/` } },
    orderBy: { receiptNumber: 'desc' },
    select: { receiptNumber: true },
  });

  return nextSequentialCode({
    prefix,
    year,
    currentMax: latest?.receiptNumber ?? null,
    padding: 5,
  });
}

/**
 * Records a payment against an invoice.
 *
 * The invoice totals, the installment, and the receipt are written in one
 * transaction. Overpayment is rejected outright rather than producing a credit
 * balance, which this release has no concept of.
 */
export async function recordPayment(
  input: RecordPaymentInput,
  collectedById: string,
): Promise<PaymentRecord> {
  return withUniqueRetry(
    () =>
      prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.invoiceId, deletedAt: null },
          select: {
            id: true,
            studentId: true,
            totalAmount: true,
            paidAmount: true,
            balanceAmount: true,
            status: true,
          },
        });

        if (!invoice) throw new NotFoundError('Invoice');

        if (invoice.status === 'CANCELLED' || invoice.status === 'WAIVED') {
          throw new ConflictError(
            `This invoice is ${invoice.status.toLowerCase()} and cannot take payments`,
          );
        }

        const amount = money(input.amount);
        const balance = money(invoice.balanceAmount);

        if (balance.isZero()) {
          throw new ConflictError('This invoice is already settled in full');
        }

        if (amount.greaterThan(balance)) {
          throw new BadRequestError('The payment exceeds the outstanding balance', [
            { field: 'amount', message: `Outstanding balance is ${balance.toFixed(2)}` },
          ]);
        }

        // --- Installment allocation ---
        if (input.installmentId) {
          const installment = await tx.installment.findFirst({
            where: { id: input.installmentId, invoiceId: invoice.id },
            select: { id: true, amount: true, paidAmount: true },
          });

          if (!installment) {
            throw new NotFoundError('Installment');
          }

          const installmentBalance = money(
            money(installment.amount).sub(money(installment.paidAmount)),
          );

          if (amount.greaterThan(installmentBalance)) {
            throw new BadRequestError('The payment exceeds this installment', [
              {
                field: 'amount',
                message: `Installment balance is ${installmentBalance.toFixed(2)}`,
              },
            ]);
          }

          const installmentPaid = money(money(installment.paidAmount).add(amount));

          await tx.installment.update({
            where: { id: installment.id },
            data: {
              paidAmount: installmentPaid,
              status: installmentPaid.greaterThanOrEqualTo(money(installment.amount))
                ? 'PAID'
                : 'PARTIALLY_PAID',
            },
          });
        }

        // --- Invoice totals ---
        const paidAmount = money(money(invoice.paidAmount).add(amount));
        const balanceAmount = money(money(invoice.totalAmount).sub(paidAmount));

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount,
            balanceAmount,
            status: balanceAmount.isZero() ? 'PAID' : 'PARTIALLY_PAID',
          },
        });

        // --- Receipt ---
        const receiptNumber = await generateReceiptNumber(tx, input.paidAt.getUTCFullYear());

        const payment = await tx.payment.create({
          data: {
            receiptNumber,
            invoiceId: invoice.id,
            studentId: invoice.studentId,
            installmentId: input.installmentId ?? null,
            amount,
            method: input.method,
            status: 'COMPLETED',
            paidAt: input.paidAt,
            transactionRef: input.transactionRef ?? null,
            remarks: input.remarks ?? null,
            collectedById,
          },
        });

        // The student's timeline is the audit trail parents actually read.
        await tx.studentTimelineEvent.create({
          data: {
            studentId: invoice.studentId,
            type: 'FEE',
            title: `Payment received — ${receiptNumber}`,
            description: `${amount.toFixed(2)} paid by ${input.method.toLowerCase().replace(/_/g, ' ')}`,
            occurredAt: input.paidAt,
            createdById: collectedById,
          },
        });

        return tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude });
      }),
    'receiptNumber',
  );
}

/**
 * Refunds a payment, reversing its effect on the invoice.
 *
 * The payment row is retained with REFUNDED status so the ledger keeps a
 * complete history rather than silently losing the transaction.
 */
export async function refundPayment(
  paymentId: string,
  reason: string,
  performedById: string,
): Promise<PaymentRecord> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        amount: true,
        status: true,
        studentId: true,
        installmentId: true,
        invoice: {
          select: { id: true, totalAmount: true, paidAmount: true, dueDate: true },
        },
      },
    });

    if (!payment) throw new NotFoundError('Payment');

    if (payment.status !== 'COMPLETED') {
      throw new ConflictError(`Only completed payments can be refunded (this one is ${payment.status})`);
    }

    const amount = money(payment.amount);
    const paidAmount = money(money(payment.invoice.paidAmount).sub(amount));
    const balanceAmount = money(money(payment.invoice.totalAmount).sub(paidAmount));

    // Recompute the status from the new balance rather than assuming.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const isOverdue = payment.invoice.dueDate < today;

    await tx.invoice.update({
      where: { id: payment.invoice.id },
      data: {
        paidAmount,
        balanceAmount,
        status: balanceAmount.isZero()
          ? 'PAID'
          : paidAmount.isZero()
            ? isOverdue
              ? 'OVERDUE'
              : 'PENDING'
            : 'PARTIALLY_PAID',
      },
    });

    if (payment.installmentId) {
      const installment = await tx.installment.findUnique({
        where: { id: payment.installmentId },
        select: { id: true, amount: true, paidAmount: true, dueDate: true },
      });

      if (installment) {
        const installmentPaid = money(money(installment.paidAmount).sub(amount));
        await tx.installment.update({
          where: { id: installment.id },
          data: {
            paidAmount: installmentPaid,
            status: installmentPaid.greaterThanOrEqualTo(money(installment.amount))
              ? 'PAID'
              : installmentPaid.isZero()
                ? installment.dueDate < today
                  ? 'OVERDUE'
                  : 'PENDING'
                : 'PARTIALLY_PAID',
          },
        });
      }
    }

    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'REFUNDED', remarks: `Refunded: ${reason}` },
    });

    await tx.studentTimelineEvent.create({
      data: {
        studentId: payment.studentId,
        type: 'FEE',
        title: 'Payment refunded',
        description: `${amount.toFixed(2)} refunded — ${reason}`,
        occurredAt: new Date(),
        createdById: performedById,
      },
    });

    return tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: paymentInclude });
  });
}

export interface PaymentFilters {
  studentId?: string;
  invoiceId?: string;
  method?: PaymentMethod;
  paidFrom?: Date;
  paidTo?: Date;
}

async function buildScope(user: AuthenticatedUser): Promise<Prisma.PaymentWhereInput> {
  if (user.role === 'STUDENT') {
    return { studentId: user.studentId ?? '__none__' };
  }

  if (user.role === 'PARENT') {
    const links = await prisma.studentGuardian.findMany({
      where: { guardianId: user.guardianId ?? '' },
      select: { studentId: true },
    });
    return { studentId: { in: links.map((link) => link.studentId) } };
  }

  return {};
}

export async function listPayments(
  user: AuthenticatedUser,
  query: ListQueryOptions,
  filters: PaymentFilters,
): Promise<PaginatedData<PaymentRecord>> {
  const scope = await buildScope(user);

  const where: Prisma.PaymentWhereInput = {
    ...scope,
    ...(filters.studentId ? { studentId: filters.studentId } : {}),
    ...(filters.invoiceId ? { invoiceId: filters.invoiceId } : {}),
    ...(filters.method ? { method: filters.method } : {}),
    ...(filters.paidFrom || filters.paidTo
      ? {
          paidAt: {
            ...(filters.paidFrom ? { gte: filters.paidFrom } : {}),
            ...(filters.paidTo ? { lte: filters.paidTo } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { receiptNumber: { contains: query.search, mode: 'insensitive' } },
            { transactionRef: { contains: query.search, mode: 'insensitive' } },
            { invoice: { invoiceNumber: { contains: query.search, mode: 'insensitive' } } },
            { student: { admissionNumber: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: { paidAt: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.payment.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getPayment(user: AuthenticatedUser, id: string): Promise<PaymentRecord> {
  const scope = await buildScope(user);

  const payment = await prisma.payment.findFirst({
    where: { id, ...scope },
    include: paymentInclude,
  });

  if (!payment) throw new NotFoundError('Payment');
  return payment;
}

/** Everything needed to render or print a receipt. */
export async function getReceipt(user: AuthenticatedUser, paymentId: string) {
  const payment = await getPayment(user, paymentId);
  const institution = await prisma.institution.findFirst({
    select: { name: true, code: true, email: true, phone: true, logoId: true, currency: true },
  });

  return { institution, payment };
}

/** Collection totals for the dashboard and finance reports. */
export async function getCollectionSummary(filters: {
  academicYearId?: string;
  from?: Date;
  to?: Date;
}) {
  const paymentWhere: Prisma.PaymentWhereInput = {
    status: 'COMPLETED',
    ...(filters.academicYearId ? { invoice: { academicYearId: filters.academicYearId } } : {}),
    ...(filters.from || filters.to
      ? {
          paidAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const invoiceWhere: Prisma.InvoiceWhereInput = {
    deletedAt: null,
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
  };

  const [collected, byMethod, invoiceTotals, outstanding] = await Promise.all([
    prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.groupBy({
      by: ['method'],
      where: paymentWhere,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: invoiceWhere,
      _sum: { totalAmount: true, paidAmount: true, balanceAmount: true },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: { ...invoiceWhere, status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] } },
      _sum: { balanceAmount: true },
      _count: { _all: true },
    }),
  ]);

  const billed = money(invoiceTotals._sum.totalAmount ?? ZERO);
  const paid = money(invoiceTotals._sum.paidAmount ?? ZERO);

  return {
    collectedInPeriod: money(collected._sum.amount ?? ZERO),
    paymentCount: collected._count._all,
    totalBilled: billed,
    totalCollected: paid,
    totalOutstanding: money(outstanding._sum.balanceAmount ?? ZERO),
    outstandingInvoiceCount: outstanding._count._all,
    invoiceCount: invoiceTotals._count._all,
    collectionRate: billed.isZero() ? null : Number(paid.div(billed).mul(100).toFixed(2)),
    byMethod: byMethod.map((row) => ({
      method: row.method,
      amount: money(row._sum.amount ?? ZERO),
      count: row._count._all,
    })),
  };
}

/** Daily collection totals for the dashboard trend chart. */
export async function getCollectionTrend(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<{ day: Date; total: Prisma.Decimal; count: bigint }[]>`
    SELECT
      DATE("paidAt") AS day,
      SUM(amount) AS total,
      COUNT(*) AS count
    FROM payments
    WHERE status = 'COMPLETED' AND "paidAt" BETWEEN ${from} AND ${to}
    GROUP BY DATE("paidAt")
    ORDER BY day ASC
  `;

  return rows.map((row) => ({
    date: row.day,
    amount: money(row.total),
    count: Number(row.count),
  }));
}

/** Flat rows for the fee collection report export. */
export async function getPaymentReportRows(filters: {
  academicYearId?: string;
  classId?: string;
  from?: Date;
  to?: Date;
}) {
  const payments = await prisma.payment.findMany({
    where: {
      status: 'COMPLETED',
      ...(filters.academicYearId ? { invoice: { academicYearId: filters.academicYearId } } : {}),
      ...(filters.classId ? { student: { classId: filters.classId } } : {}),
      ...(filters.from || filters.to
        ? {
            paidAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    include: paymentInclude,
    orderBy: { paidAt: 'asc' },
  });

  return payments.map((payment) => ({
    'Receipt Number': payment.receiptNumber,
    'Invoice Number': payment.invoice.invoiceNumber,
    'Admission Number': payment.student.admissionNumber,
    Student: `${payment.student.user.firstName} ${payment.student.user.lastName}`,
    Class: payment.student.class?.name ?? '',
    Section: payment.student.section?.name ?? '',
    Amount: Number(payment.amount),
    Method: payment.method,
    'Paid On': payment.paidAt.toISOString().slice(0, 10),
    'Transaction Ref': payment.transactionRef ?? '',
    'Collected By': payment.collectedBy
      ? `${payment.collectedBy.firstName} ${payment.collectedBy.lastName}`
      : '',
  }));
}

/** Flat rows for the outstanding-fees report export. */
export async function getOutstandingReportRows(filters: {
  academicYearId?: string;
  classId?: string;
}) {
  const invoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
      ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
      ...(filters.classId ? { student: { classId: filters.classId } } : {}),
    },
    include: {
      student: {
        select: {
          admissionNumber: true,
          user: { select: { firstName: true, lastName: true, phone: true } },
          class: { select: { name: true } },
          section: { select: { name: true } },
          guardians: {
            where: { isPrimary: true },
            take: 1,
            select: { guardian: { select: { firstName: true, lastName: true, phone: true } } },
          },
        },
      },
    },
    orderBy: [{ dueDate: 'asc' }],
  });

  return invoices.map((invoice) => ({
    'Invoice Number': invoice.invoiceNumber,
    'Admission Number': invoice.student.admissionNumber,
    Student: `${invoice.student.user.firstName} ${invoice.student.user.lastName}`,
    Class: invoice.student.class?.name ?? '',
    Section: invoice.student.section?.name ?? '',
    'Total Amount': Number(invoice.totalAmount),
    Paid: Number(invoice.paidAmount),
    Outstanding: Number(invoice.balanceAmount),
    'Due Date': invoice.dueDate.toISOString().slice(0, 10),
    Status: invoice.status,
    'Guardian': invoice.student.guardians[0]
      ? `${invoice.student.guardians[0].guardian.firstName} ${invoice.student.guardians[0].guardian.lastName}`
      : '',
    'Guardian Phone': invoice.student.guardians[0]?.guardian.phone ?? '',
  }));
}

export { sum };
