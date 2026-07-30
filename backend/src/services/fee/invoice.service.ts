import { Prisma, type InvoiceStatus } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import type { AuthenticatedUser } from '@/types/auth';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';
import { nextSequentialCode, withUniqueRetry } from '@/utils/sequence';
import type { BulkInvoiceInput, CreateInvoiceInput } from '@/validators/fee.validator';
import { applyConcession, money, splitInstallments, sum, ZERO } from './money';

const invoiceInclude = {
  student: {
    select: {
      id: true,
      admissionNumber: true,
      rollNumber: true,
      user: { select: { firstName: true, lastName: true, email: true } },
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
    },
  },
  academicYear: { select: { id: true, name: true } },
  feeStructure: { select: { id: true, name: true } },
  items: { include: { feeCategory: { select: { id: true, name: true, type: true } } } },
  installments: { orderBy: { installmentNumber: 'asc' } },
  payments: {
    where: { status: 'COMPLETED' },
    orderBy: { paidAt: 'desc' },
    include: { collectedBy: { select: { firstName: true, lastName: true } } },
  },
  createdBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceRecord = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export interface InvoiceFilters {
  studentId?: string;
  academicYearId?: string;
  classId?: string;
  sectionId?: string;
  status?: InvoiceStatus[];
  issuedFrom?: Date;
  issuedTo?: Date;
  onlyOutstanding?: boolean;
}

/** Students see their own invoices; parents see their children's. */
async function buildScope(user: AuthenticatedUser): Promise<Prisma.InvoiceWhereInput> {
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

export async function listInvoices(
  user: AuthenticatedUser,
  query: ListQueryOptions,
  filters: InvoiceFilters,
): Promise<PaginatedData<InvoiceRecord>> {
  const scope = await buildScope(user);

  const where: Prisma.InvoiceWhereInput = {
    deletedAt: null,
    ...scope,
    ...(filters.studentId ? { studentId: filters.studentId } : {}),
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.classId ? { student: { classId: filters.classId } } : {}),
    ...(filters.sectionId ? { student: { sectionId: filters.sectionId } } : {}),
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(filters.onlyOutstanding
      ? { status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] } }
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
            { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
            { student: { admissionNumber: { contains: query.search, mode: 'insensitive' } } },
            { student: { user: { firstName: { contains: query.search, mode: 'insensitive' } } } },
            { student: { user: { lastName: { contains: query.search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: invoiceInclude,
      orderBy: { issueDate: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.invoice.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getInvoice(user: AuthenticatedUser, id: string): Promise<InvoiceRecord> {
  const scope = await buildScope(user);

  const invoice = await prisma.invoice.findFirst({
    where: { id, deletedAt: null, ...scope },
    include: invoiceInclude,
  });

  if (!invoice) throw new NotFoundError('Invoice');
  return invoice;
}

/** Allocates the next invoice number, e.g. `INV/2026/0001`. */
async function generateInvoiceNumber(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const prefix = 'INV';
  const latest = await tx.invoice.findFirst({
    where: { invoiceNumber: { startsWith: `${prefix}/${year}/` } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });

  return nextSequentialCode({ prefix, year, currentMax: latest?.invoiceNumber ?? null });
}

interface ResolvedLine {
  feeCategoryId: string;
  description: string;
  amount: Prisma.Decimal;
}

/** Concession totals a student is entitled to for an academic year. */
async function computeConcessions(
  tx: Prisma.TransactionClient,
  studentId: string,
  academicYearId: string,
  subtotal: Prisma.Decimal,
): Promise<{ scholarshipAmount: Prisma.Decimal; discountAmount: Prisma.Decimal }> {
  const [scholarships, discounts] = await Promise.all([
    tx.studentScholarship.findMany({
      where: { studentId, academicYearId, status: 'ACTIVE' },
      include: { scholarship: { select: { type: true, value: true, isActive: true } } },
    }),
    tx.studentDiscount.findMany({
      where: { studentId, academicYearId, status: 'ACTIVE' },
      include: { discount: { select: { type: true, value: true, isActive: true } } },
    }),
  ]);

  let scholarshipAmount = ZERO;
  for (const award of scholarships) {
    if (!award.scholarship.isActive) continue;
    scholarshipAmount = scholarshipAmount.add(
      applyConcession(subtotal, award.scholarship.type, award.scholarship.value),
    );
  }

  let discountAmount = ZERO;
  for (const award of discounts) {
    if (!award.discount.isActive) continue;
    discountAmount = discountAmount.add(
      applyConcession(subtotal, award.discount.type, award.discount.value),
    );
  }

  // Concessions together can never exceed the invoice subtotal.
  const combined = money(scholarshipAmount.add(discountAmount));
  if (combined.greaterThan(subtotal)) {
    const scale = subtotal.div(combined);
    return {
      scholarshipAmount: money(scholarshipAmount.mul(scale)),
      discountAmount: money(subtotal.sub(money(scholarshipAmount.mul(scale)))),
    };
  }

  return { scholarshipAmount: money(scholarshipAmount), discountAmount: money(discountAmount) };
}

/** Resolves the invoice lines from a fee structure plus any ad-hoc extras. */
async function resolveLines(
  tx: Prisma.TransactionClient,
  feeStructureId: string | null,
  extras: { feeCategoryId: string; description: string; amount: number }[],
): Promise<ResolvedLine[]> {
  const lines: ResolvedLine[] = [];

  if (feeStructureId) {
    const structure = await tx.feeStructure.findFirst({
      where: { id: feeStructureId, deletedAt: null },
      include: { items: { include: { feeCategory: { select: { name: true } } } } },
    });

    if (!structure) throw new NotFoundError('Fee structure');

    for (const item of structure.items) {
      // Optional lines are opt-in, so they are excluded from automatic billing.
      if (item.isOptional) continue;

      lines.push({
        feeCategoryId: item.feeCategoryId,
        description: item.feeCategory.name,
        amount: money(item.amount),
      });
    }
  }

  for (const extra of extras) {
    lines.push({
      feeCategoryId: extra.feeCategoryId,
      description: extra.description,
      amount: money(extra.amount),
    });
  }

  if (lines.length === 0) {
    throw new ConflictError('The invoice would have no billable lines', [
      { field: 'items', message: 'Add at least one line, or pick a structure with mandatory fees' },
    ]);
  }

  return lines;
}

export async function createInvoice(
  input: CreateInvoiceInput,
  createdById: string,
): Promise<InvoiceRecord> {
  const student = await prisma.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true },
  });

  if (!student) throw new NotFoundError('Student');

  return withUniqueRetry(
    () =>
      prisma.$transaction(async (tx) => {
        const lines = await resolveLines(tx, input.feeStructureId ?? null, input.items);
        const subtotal = sum(lines.map((line) => line.amount));

        const { scholarshipAmount, discountAmount } = input.applyConcessions
          ? await computeConcessions(tx, input.studentId, input.academicYearId, subtotal)
          : { scholarshipAmount: ZERO, discountAmount: ZERO };

        const totalAmount = money(subtotal.sub(scholarshipAmount).sub(discountAmount));

        const invoiceNumber = await generateInvoiceNumber(tx, input.issueDate.getUTCFullYear());

        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            studentId: input.studentId,
            academicYearId: input.academicYearId,
            feeStructureId: input.feeStructureId ?? null,
            issueDate: input.issueDate,
            dueDate: input.dueDate,
            subtotal,
            scholarshipAmount,
            discountAmount,
            lateFeeAmount: ZERO,
            totalAmount,
            paidAmount: ZERO,
            balanceAmount: totalAmount,
            status: totalAmount.isZero() ? 'PAID' : 'PENDING',
            notes: input.notes ?? null,
            createdById,
            items: {
              create: lines.map((line) => ({
                feeCategoryId: line.feeCategoryId,
                description: line.description,
                amount: line.amount,
              })),
            },
          },
        });

        // Explicit installments win; otherwise the invoice is billed in one go.
        const schedule =
          input.installments.length > 0
            ? input.installments.map((installment, index) => ({
                installmentNumber: index + 1,
                amount: money(installment.amount),
                dueDate: installment.dueDate,
              }))
            : [];

        if (schedule.length > 0) {
          const scheduled = sum(schedule.map((installment) => installment.amount));
          if (!scheduled.equals(totalAmount)) {
            throw new ConflictError(
              `Installments total ${scheduled.toFixed(2)} but the invoice is ${totalAmount.toFixed(2)}`,
              [{ field: 'installments', message: 'Installments must add up to the invoice total' }],
            );
          }

          await tx.installment.createMany({
            data: schedule.map((installment) => ({
              invoiceId: invoice.id,
              installmentNumber: installment.installmentNumber,
              amount: installment.amount,
              dueDate: installment.dueDate,
              status: 'PENDING' as const,
            })),
          });
        }

        return tx.invoice.findUniqueOrThrow({
          where: { id: invoice.id },
          include: invoiceInclude,
        });
      }),
    'invoiceNumber',
  );
}

/** Issues one invoice per active student in a class or section. */
export async function createBulkInvoices(
  input: BulkInvoiceInput,
  createdById: string,
): Promise<{ created: number; skipped: { studentId: string; reason: string }[] }> {
  const students = await prisma.student.findMany({
    where: {
      classId: input.classId,
      ...(input.sectionId ? { sectionId: input.sectionId } : {}),
      deletedAt: null,
      status: 'ACTIVE',
    },
    select: { id: true, admissionNumber: true },
  });

  if (students.length === 0) {
    throw new ConflictError('No active students found for that class or section');
  }

  const skipped: { studentId: string; reason: string }[] = [];
  let created = 0;

  // Sequential rather than parallel: invoice numbers are allocated from the
  // current maximum, so concurrent inserts would collide and burn retries.
  for (const student of students) {
    const existing = await prisma.invoice.findFirst({
      where: {
        studentId: student.id,
        feeStructureId: input.feeStructureId,
        academicYearId: input.academicYearId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existing) {
      skipped.push({ studentId: student.id, reason: 'Already invoiced for this structure' });
      continue;
    }

    try {
      const invoice = await createInvoice(
        {
          studentId: student.id,
          academicYearId: input.academicYearId,
          feeStructureId: input.feeStructureId,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          items: [],
          installments: [],
          applyConcessions: input.applyConcessions,
          ...(input.notes ? { notes: input.notes } : {}),
        },
        createdById,
      );

      // Installments are generated after the total is known, so the split is
      // computed from the post-concession amount rather than the list price.
      if (input.installmentCount > 1) {
        await generateInstallments(invoice.id, input.installmentCount, input.dueDate);
      }

      created += 1;
    } catch (error) {
      skipped.push({
        studentId: student.id,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { created, skipped };
}

/** Splits an existing invoice into monthly installments. */
export async function generateInstallments(
  invoiceId: string,
  count: number,
  firstDueDate: Date,
): Promise<void> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    select: { totalAmount: true, paidAmount: true, _count: { select: { installments: true } } },
  });

  if (!invoice) throw new NotFoundError('Invoice');

  if (invoice._count.installments > 0) {
    throw new ConflictError('This invoice already has an installment plan');
  }

  if (!money(invoice.paidAmount).isZero()) {
    throw new ConflictError('An installment plan cannot be added after a payment has been taken');
  }

  const parts = splitInstallments(money(invoice.totalAmount), count);

  await prisma.installment.createMany({
    data: parts.map((amount, index) => {
      const dueDate = new Date(firstDueDate);
      dueDate.setUTCMonth(dueDate.getUTCMonth() + index);

      return {
        invoiceId,
        installmentNumber: index + 1,
        amount,
        dueDate,
        status: 'PENDING' as const,
      };
    }),
  });
}

export async function updateInvoice(
  id: string,
  data: { dueDate?: Date; notes?: string; status?: InvoiceStatus },
): Promise<InvoiceRecord> {
  const invoice = await prisma.invoice.findFirst({
    where: { id, deletedAt: null },
    select: { status: true, paidAmount: true },
  });

  if (!invoice) throw new NotFoundError('Invoice');

  // Cancelling an invoice that has taken money would orphan the payment.
  if (data.status === 'CANCELLED' && !money(invoice.paidAmount).isZero()) {
    throw new ConflictError('An invoice with payments cannot be cancelled. Refund the payments first.');
  }

  await prisma.invoice.update({ where: { id }, data });

  return prisma.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
}

export async function deleteInvoice(id: string): Promise<void> {
  const invoice = await prisma.invoice.findFirst({
    where: { id, deletedAt: null },
    select: { paidAmount: true, _count: { select: { payments: true } } },
  });

  if (!invoice) throw new NotFoundError('Invoice');

  if (invoice._count.payments > 0) {
    throw new ConflictError('An invoice with recorded payments cannot be deleted.', [
      { field: 'id', message: `${invoice._count.payments} payment(s) recorded` },
    ]);
  }

  await prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
}

/**
 * Marks overdue invoices.
 *
 * Idempotent, so it is safe to call from a scheduled job or on demand.
 */
export async function markOverdueInvoices(): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const { count } = await prisma.invoice.updateMany({
    where: {
      deletedAt: null,
      dueDate: { lt: today },
      status: { in: ['PENDING', 'PARTIALLY_PAID'] },
    },
    data: { status: 'OVERDUE' },
  });

  await prisma.installment.updateMany({
    where: { dueDate: { lt: today }, status: { in: ['PENDING', 'PARTIALLY_PAID'] } },
    data: { status: 'OVERDUE' },
  });

  return count;
}

/** Outstanding-fee summary per student, for the dashboard and reminders. */
export async function getOutstandingSummary(academicYearId?: string) {
  const grouped = await prisma.invoice.groupBy({
    by: ['studentId'],
    where: {
      deletedAt: null,
      status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
      ...(academicYearId ? { academicYearId } : {}),
    },
    _sum: { balanceAmount: true },
    _count: { _all: true },
    orderBy: { _sum: { balanceAmount: 'desc' } },
    take: 100,
  });

  const students = await prisma.student.findMany({
    where: { id: { in: grouped.map((row) => row.studentId) } },
    select: {
      id: true,
      admissionNumber: true,
      user: { select: { firstName: true, lastName: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  });

  const studentById = new Map(students.map((student) => [student.id, student]));

  return grouped.map((row) => {
    const student = studentById.get(row.studentId);
    return {
      studentId: row.studentId,
      admissionNumber: student?.admissionNumber ?? '',
      name: student ? `${student.user.firstName} ${student.user.lastName}` : '',
      className: student?.class?.name ?? null,
      sectionName: student?.section?.name ?? null,
      invoiceCount: row._count._all,
      outstanding: row._sum.balanceAmount ?? ZERO,
    };
  });
}
