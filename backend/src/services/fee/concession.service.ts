import { Prisma, type Discount, type Scholarship } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';

// ---------------------------------------------------------------- Scholarships

export async function listScholarships(
  query: ListQueryOptions,
  filters: { academicYearId?: string; isActive?: boolean },
): Promise<PaginatedData<Scholarship & { _count: { awards: number } }>> {
  const where: Prisma.ScholarshipWhereInput = {
    deletedAt: null,
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.scholarship.findMany({
      where,
      include: { _count: { select: { awards: true } } },
      orderBy: { name: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.scholarship.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function createScholarship(
  data: Prisma.ScholarshipUncheckedCreateInput,
): Promise<Scholarship> {
  assertPercentageIsSane(data.type as string, Number(data.value));
  return prisma.scholarship.create({ data });
}

export async function updateScholarship(
  id: string,
  data: Prisma.ScholarshipUncheckedUpdateInput,
): Promise<Scholarship> {
  const existing = await prisma.scholarship.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Scholarship');

  if (data.type !== undefined || data.value !== undefined) {
    assertPercentageIsSane(
      (data.type as string | undefined) ?? existing.type,
      Number(data.value ?? existing.value),
    );
  }

  return prisma.scholarship.update({ where: { id }, data });
}

export async function deleteScholarship(id: string): Promise<void> {
  const scholarship = await prisma.scholarship.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { awards: true } } },
  });

  if (!scholarship) throw new NotFoundError('Scholarship');

  if (scholarship._count.awards > 0) {
    throw new ConflictError('This scholarship has been awarded to students.', [
      { field: 'id', message: `${scholarship._count.awards} award(s) exist` },
    ]);
  }

  await prisma.scholarship.update({ where: { id }, data: { deletedAt: new Date() } });
}

/** A percentage concession above 100% would produce a negative invoice. */
function assertPercentageIsSane(type: string, value: number): void {
  if (type === 'PERCENTAGE' && value > 100) {
    throw new ConflictError('A percentage concession cannot exceed 100%', [
      { field: 'value', message: 'Enter a value between 0 and 100' },
    ]);
  }
}

const awardInclude = {
  student: {
    select: {
      id: true,
      admissionNumber: true,
      user: { select: { firstName: true, lastName: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  },
  scholarship: { select: { id: true, name: true, type: true, value: true } },
  academicYear: { select: { id: true, name: true } },
  approvedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.StudentScholarshipInclude;

export async function awardScholarship(
  input: {
    studentId: string;
    scholarshipId: string;
    academicYearId: string;
    awardedDate: Date;
    remarks?: string;
  },
  approvedById: string,
) {
  const [student, scholarship] = await Promise.all([
    prisma.student.findFirst({ where: { id: input.studentId, deletedAt: null }, select: { id: true } }),
    prisma.scholarship.findFirst({
      where: { id: input.scholarshipId, deletedAt: null, isActive: true },
      select: { id: true },
    }),
  ]);

  if (!student) throw new NotFoundError('Student');
  if (!scholarship) throw new NotFoundError('Scholarship');

  const existing = await prisma.studentScholarship.findUnique({
    where: {
      studentId_scholarshipId_academicYearId: {
        studentId: input.studentId,
        scholarshipId: input.scholarshipId,
        academicYearId: input.academicYearId,
      },
    },
    select: { id: true, status: true },
  });

  if (existing && existing.status === 'ACTIVE') {
    throw new ConflictError('This scholarship is already awarded to the student for that year');
  }

  const award = await prisma.studentScholarship.upsert({
    where: {
      studentId_scholarshipId_academicYearId: {
        studentId: input.studentId,
        scholarshipId: input.scholarshipId,
        academicYearId: input.academicYearId,
      },
    },
    create: {
      studentId: input.studentId,
      scholarshipId: input.scholarshipId,
      academicYearId: input.academicYearId,
      awardedDate: input.awardedDate,
      remarks: input.remarks ?? null,
      status: 'ACTIVE',
      approvedById,
    },
    update: {
      awardedDate: input.awardedDate,
      remarks: input.remarks ?? null,
      status: 'ACTIVE',
      approvedById,
    },
    include: awardInclude,
  });

  await prisma.studentTimelineEvent.create({
    data: {
      studentId: input.studentId,
      type: 'FEE',
      title: `Scholarship awarded — ${award.scholarship.name}`,
      description: input.remarks ?? null,
      occurredAt: input.awardedDate,
      createdById: approvedById,
    },
  });

  return award;
}

export async function revokeScholarshipAward(id: string): Promise<void> {
  const award = await prisma.studentScholarship.findUnique({ where: { id } });
  if (!award) throw new NotFoundError('Scholarship award');

  // Revoked rather than deleted, so the history of what was granted survives.
  await prisma.studentScholarship.update({ where: { id }, data: { status: 'REVOKED' } });
}

export async function listStudentConcessions(studentId: string, academicYearId?: string) {
  const [scholarships, discounts] = await Promise.all([
    prisma.studentScholarship.findMany({
      where: { studentId, ...(academicYearId ? { academicYearId } : {}) },
      include: awardInclude,
      orderBy: { awardedDate: 'desc' },
    }),
    prisma.studentDiscount.findMany({
      where: { studentId, ...(academicYearId ? { academicYearId } : {}) },
      include: {
        discount: { select: { id: true, name: true, type: true, value: true, reason: true } },
        academicYear: { select: { id: true, name: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return { scholarships, discounts };
}

// ------------------------------------------------------------------- Discounts

export async function listDiscounts(
  query: ListQueryOptions,
  filters: { academicYearId?: string; isActive?: boolean },
): Promise<PaginatedData<Discount & { _count: { awards: number } }>> {
  const where: Prisma.DiscountWhereInput = {
    deletedAt: null,
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.discount.findMany({
      where,
      include: { _count: { select: { awards: true } } },
      orderBy: { name: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.discount.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function createDiscount(
  data: Prisma.DiscountUncheckedCreateInput,
): Promise<Discount> {
  assertPercentageIsSane(data.type as string, Number(data.value));
  return prisma.discount.create({ data });
}

export async function updateDiscount(
  id: string,
  data: Prisma.DiscountUncheckedUpdateInput,
): Promise<Discount> {
  const existing = await prisma.discount.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Discount');

  if (data.type !== undefined || data.value !== undefined) {
    assertPercentageIsSane(
      (data.type as string | undefined) ?? existing.type,
      Number(data.value ?? existing.value),
    );
  }

  return prisma.discount.update({ where: { id }, data });
}

export async function deleteDiscount(id: string): Promise<void> {
  const discount = await prisma.discount.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { awards: true } } },
  });

  if (!discount) throw new NotFoundError('Discount');

  if (discount._count.awards > 0) {
    throw new ConflictError('This discount has been awarded to students.', [
      { field: 'id', message: `${discount._count.awards} award(s) exist` },
    ]);
  }

  await prisma.discount.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function awardDiscount(
  input: { studentId: string; discountId: string; academicYearId: string; remarks?: string },
  approvedById: string,
) {
  const [student, discount] = await Promise.all([
    prisma.student.findFirst({ where: { id: input.studentId, deletedAt: null }, select: { id: true } }),
    prisma.discount.findFirst({
      where: { id: input.discountId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
    }),
  ]);

  if (!student) throw new NotFoundError('Student');
  if (!discount) throw new NotFoundError('Discount');

  const award = await prisma.studentDiscount.upsert({
    where: {
      studentId_discountId_academicYearId: {
        studentId: input.studentId,
        discountId: input.discountId,
        academicYearId: input.academicYearId,
      },
    },
    create: {
      studentId: input.studentId,
      discountId: input.discountId,
      academicYearId: input.academicYearId,
      remarks: input.remarks ?? null,
      status: 'ACTIVE',
      approvedById,
    },
    update: { remarks: input.remarks ?? null, status: 'ACTIVE', approvedById },
    include: {
      discount: { select: { id: true, name: true, type: true, value: true } },
      student: {
        select: {
          id: true,
          admissionNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      academicYear: { select: { id: true, name: true } },
    },
  });

  await prisma.studentTimelineEvent.create({
    data: {
      studentId: input.studentId,
      type: 'FEE',
      title: `Discount applied — ${discount.name}`,
      description: input.remarks ?? null,
      occurredAt: new Date(),
      createdById: approvedById,
    },
  });

  return award;
}

export async function revokeDiscountAward(id: string): Promise<void> {
  const award = await prisma.studentDiscount.findUnique({ where: { id } });
  if (!award) throw new NotFoundError('Discount award');
  await prisma.studentDiscount.update({ where: { id }, data: { status: 'REVOKED' } });
}
