import { Prisma, type FeeCategory, type FeeCategoryType, type LateFeeRule } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildOrderBy, buildPaginationMeta } from '@/utils/pagination';
import type {
  ApplyLateFeesInput,
  CreateFeeStructureInput,
} from '@/validators/fee.validator';
import { applyConcession, money, sum, ZERO } from './money';

// ------------------------------------------------------------- Fee categories

export async function listFeeCategories(
  query: ListQueryOptions,
  filters: { type?: FeeCategoryType; isActive?: boolean },
): Promise<PaginatedData<FeeCategory>> {
  const where: Prisma.FeeCategoryWhereInput = {
    deletedAt: null,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.feeCategory.findMany({
      where,
      orderBy: buildOrderBy(query.sortBy ?? 'name', query.sortOrder),
      skip: query.skip,
      take: query.take,
    }),
    prisma.feeCategory.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function createFeeCategory(
  data: Prisma.FeeCategoryUncheckedCreateInput,
): Promise<FeeCategory> {
  return prisma.feeCategory.create({ data });
}

export async function updateFeeCategory(
  id: string,
  data: Prisma.FeeCategoryUncheckedUpdateInput,
): Promise<FeeCategory> {
  const existing = await prisma.feeCategory.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Fee category');
  return prisma.feeCategory.update({ where: { id }, data });
}

export async function deleteFeeCategory(id: string): Promise<void> {
  const category = await prisma.feeCategory.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { structureItems: true, invoiceItems: true } } },
  });

  if (!category) throw new NotFoundError('Fee category');

  const { structureItems, invoiceItems } = category._count;
  if (structureItems + invoiceItems > 0) {
    throw new ConflictError('This fee category is in use.', [
      {
        field: 'id',
        message: `Used by ${structureItems} structure line(s) and ${invoiceItems} invoice line(s)`,
      },
    ]);
  }

  await prisma.feeCategory.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ------------------------------------------------------------ Fee structures

const structureInclude = {
  academicYear: { select: { id: true, name: true } },
  class: { select: { id: true, name: true, code: true } },
  course: { select: { id: true, name: true, code: true } },
  items: {
    include: { feeCategory: { select: { id: true, name: true, type: true } } },
    orderBy: { createdAt: 'asc' },
  },
  _count: { select: { invoices: true } },
} satisfies Prisma.FeeStructureInclude;

export type FeeStructureRecord = Prisma.FeeStructureGetPayload<{
  include: typeof structureInclude;
}>;

export async function listFeeStructures(
  query: ListQueryOptions,
  filters: { academicYearId?: string; classId?: string; isActive?: boolean },
): Promise<PaginatedData<FeeStructureRecord>> {
  const where: Prisma.FeeStructureWhereInput = {
    deletedAt: null,
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.feeStructure.findMany({
      where,
      include: structureInclude,
      orderBy: buildOrderBy(query.sortBy ?? 'name', query.sortOrder),
      skip: query.skip,
      take: query.take,
    }),
    prisma.feeStructure.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getFeeStructure(id: string): Promise<FeeStructureRecord> {
  const structure = await prisma.feeStructure.findFirst({
    where: { id, deletedAt: null },
    include: structureInclude,
  });

  if (!structure) throw new NotFoundError('Fee structure');
  return structure;
}

export async function createFeeStructure(
  input: CreateFeeStructureInput,
): Promise<FeeStructureRecord> {
  // A category may appear only once per structure.
  const categoryIds = input.items.map((item) => item.feeCategoryId);
  if (new Set(categoryIds).size !== categoryIds.length) {
    throw new ConflictError('A fee category appears more than once', [
      { field: 'items', message: 'Each category can only appear once' },
    ]);
  }

  const totalAmount = sum(input.items.map((item) => item.amount));

  const created = await prisma.feeStructure.create({
    data: {
      name: input.name,
      academicYearId: input.academicYearId,
      classId: input.classId ?? null,
      courseId: input.courseId ?? null,
      description: input.description ?? null,
      isActive: input.isActive,
      totalAmount,
      items: {
        create: input.items.map((item) => ({
          feeCategoryId: item.feeCategoryId,
          amount: item.amount,
          isOptional: item.isOptional,
          dueDate: item.dueDate ?? null,
        })),
      },
    },
  });

  return getFeeStructure(created.id);
}

export async function updateFeeStructure(
  id: string,
  input: {
    name?: string;
    classId?: string | null;
    courseId?: string | null;
    description?: string;
    isActive?: boolean;
    items?: CreateFeeStructureInput['items'];
  },
): Promise<FeeStructureRecord> {
  const existing = await prisma.feeStructure.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { invoices: true } } },
  });

  if (!existing) throw new NotFoundError('Fee structure');

  // Changing the lines after invoicing would make issued invoices unreproducible.
  if (input.items && existing._count.invoices > 0) {
    throw new ConflictError(
      'Invoices have already been issued from this structure, so its lines cannot change.',
      [{ field: 'items', message: `${existing._count.invoices} invoice(s) reference it` }],
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.feeStructure.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.classId !== undefined ? { classId: input.classId } : {}),
        ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.items ? { totalAmount: sum(input.items.map((item) => item.amount)) } : {}),
      },
    });

    if (input.items) {
      await tx.feeStructureItem.deleteMany({ where: { feeStructureId: id } });
      await tx.feeStructureItem.createMany({
        data: input.items.map((item) => ({
          feeStructureId: id,
          feeCategoryId: item.feeCategoryId,
          amount: item.amount,
          isOptional: item.isOptional,
          dueDate: item.dueDate ?? null,
        })),
      });
    }

    return tx.feeStructure.findUniqueOrThrow({ where: { id }, include: structureInclude });
  });
}

export async function deleteFeeStructure(id: string): Promise<void> {
  const structure = await prisma.feeStructure.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { invoices: true } } },
  });

  if (!structure) throw new NotFoundError('Fee structure');

  if (structure._count.invoices > 0) {
    throw new ConflictError('Invoices have been issued from this structure.', [
      { field: 'id', message: `${structure._count.invoices} invoice(s) reference it` },
    ]);
  }

  await prisma.feeStructure.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ------------------------------------------------------------- Late fee rules

export async function listLateFeeRules(): Promise<LateFeeRule[]> {
  return prisma.lateFeeRule.findMany({ orderBy: { name: 'asc' } });
}

export async function createLateFeeRule(
  data: Prisma.LateFeeRuleUncheckedCreateInput,
): Promise<LateFeeRule> {
  return prisma.lateFeeRule.create({ data });
}

export async function updateLateFeeRule(
  id: string,
  data: Prisma.LateFeeRuleUncheckedUpdateInput,
): Promise<LateFeeRule> {
  const existing = await prisma.lateFeeRule.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Late fee rule');
  return prisma.lateFeeRule.update({ where: { id }, data });
}

export async function deleteLateFeeRule(id: string): Promise<void> {
  const existing = await prisma.lateFeeRule.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Late fee rule');
  await prisma.lateFeeRule.delete({ where: { id } });
}

/**
 * Applies a late-fee rule to overdue invoices.
 *
 * Defaults to a dry run: charging money is not something to do by accident, so
 * the caller must explicitly opt into writing.
 */
export async function applyLateFees(
  input: ApplyLateFeesInput,
): Promise<{
  dryRun: boolean;
  affected: number;
  totalCharged: Prisma.Decimal;
  preview: { invoiceId: string; invoiceNumber: string; daysOverdue: number; charge: Prisma.Decimal }[];
}> {
  const rule = await prisma.lateFeeRule.findFirst({ where: { id: input.ruleId, isActive: true } });
  if (!rule) throw new NotFoundError('Late fee rule');

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Only invoices past the grace period qualify.
  const cutoff = new Date(today.getTime() - rule.gracePeriodDays * 86_400_000);

  const invoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
      dueDate: { lt: cutoff },
      ...(input.academicYearId ? { academicYearId: input.academicYearId } : {}),
    },
    select: {
      id: true,
      invoiceNumber: true,
      dueDate: true,
      subtotal: true,
      totalAmount: true,
      paidAmount: true,
      lateFeeAmount: true,
    },
  });

  const preview: {
    invoiceId: string;
    invoiceNumber: string;
    daysOverdue: number;
    charge: Prisma.Decimal;
  }[] = [];

  let totalCharged = ZERO;

  for (const invoice of invoices) {
    const daysOverdue = Math.floor((today.getTime() - invoice.dueDate.getTime()) / 86_400_000);
    const chargeableDays = Math.max(0, daysOverdue - rule.gracePeriodDays);

    if (chargeableDays === 0) continue;

    // A daily rule accrues per day; otherwise it is a one-off charge.
    const perApplication = applyConcession(
      money(invoice.subtotal),
      rule.chargeType,
      rule.chargeValue,
    );

    let charge = rule.isRecurringDaily
      ? money(perApplication.mul(chargeableDays))
      : perApplication;

    if (rule.maxCharge) {
      charge = money(Prisma.Decimal.min(charge, money(rule.maxCharge)));
    }

    // Only the increment above what has already been charged is added.
    const alreadyCharged = money(invoice.lateFeeAmount);
    const increment = money(charge.sub(alreadyCharged));

    if (increment.lessThanOrEqualTo(0)) continue;

    preview.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      daysOverdue,
      charge: increment,
    });
    totalCharged = totalCharged.add(increment);
  }

  if (!input.dryRun && preview.length > 0) {
    await prisma.$transaction(
      preview.map((entry) =>
        prisma.invoice.update({
          where: { id: entry.invoiceId },
          data: {
            lateFeeAmount: { increment: entry.charge },
            totalAmount: { increment: entry.charge },
            balanceAmount: { increment: entry.charge },
            status: 'OVERDUE',
          },
        }),
      ),
    );
  }

  return {
    dryRun: input.dryRun,
    affected: preview.length,
    totalCharged: money(totalCharged),
    preview: preview.slice(0, 50),
  };
}
