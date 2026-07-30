import type { AcademicYear, Prisma } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildOrderBy, buildPaginationMeta } from '@/utils/pagination';

export const ACADEMIC_YEAR_SORT_FIELDS = ['name', 'startDate', 'endDate', 'createdAt'] as const;

export interface AcademicYearFilters {
  status?: AcademicYear['status'];
  isCurrent?: boolean;
}

export async function listAcademicYears(
  query: ListQueryOptions,
  filters: AcademicYearFilters,
): Promise<PaginatedData<AcademicYear>> {
  const where: Prisma.AcademicYearWhereInput = {
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.isCurrent !== undefined ? { isCurrent: filters.isCurrent } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.academicYear.findMany({
      where,
      orderBy: buildOrderBy(query.sortBy ?? 'startDate', query.sortOrder),
      skip: query.skip,
      take: query.take,
    }),
    prisma.academicYear.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getAcademicYear(id: string) {
  const year = await prisma.academicYear.findFirst({
    where: { id, deletedAt: null },
    include: {
      semesters: { orderBy: { startDate: 'asc' } },
      attendanceRules: true,
      _count: { select: { classes: true, students: true, exams: true } },
    },
  });

  if (!year) throw new NotFoundError('Academic year');
  return year;
}

/** The year everything defaults to. Most modules need it, so it is read often. */
export async function getCurrentAcademicYear(): Promise<AcademicYear> {
  const year = await prisma.academicYear.findFirst({
    where: { isCurrent: true, deletedAt: null },
  });

  if (!year) {
    throw new NotFoundError('Current academic year — set one in Settings first');
  }
  return year;
}

export async function createAcademicYear(
  data: Prisma.AcademicYearUncheckedCreateInput,
): Promise<AcademicYear> {
  await assertNoOverlap(data.startDate as Date, data.endDate as Date);

  return prisma.$transaction(async (tx) => {
    if (data.isCurrent) {
      await tx.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    }

    const year = await tx.academicYear.create({ data });

    // Every year needs attendance rules; seed them with the defaults.
    await tx.attendanceRule.create({ data: { academicYearId: year.id } });

    return year;
  });
}

export async function updateAcademicYear(
  id: string,
  data: Prisma.AcademicYearUncheckedUpdateInput,
): Promise<AcademicYear> {
  const existing = await prisma.academicYear.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Academic year');

  const startDate = (data.startDate as Date | undefined) ?? existing.startDate;
  const endDate = (data.endDate as Date | undefined) ?? existing.endDate;
  await assertNoOverlap(startDate, endDate, id);

  return prisma.$transaction(async (tx) => {
    if (data.isCurrent === true) {
      await tx.academicYear.updateMany({
        where: { isCurrent: true, id: { not: id } },
        data: { isCurrent: false },
      });
    }
    return tx.academicYear.update({ where: { id }, data });
  });
}

/** Soft delete. Refused while the year still holds records. */
export async function deleteAcademicYear(id: string): Promise<void> {
  const year = await prisma.academicYear.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { classes: true, students: true, exams: true, invoices: true } } },
  });

  if (!year) throw new NotFoundError('Academic year');

  if (year.isCurrent) {
    throw new ConflictError('The current academic year cannot be deleted. Make another year current first.');
  }

  const { classes, students, exams, invoices } = year._count;
  if (classes + students + exams + invoices > 0) {
    throw new ConflictError(
      'This academic year still has classes, students, exams or invoices linked to it.',
      [
        {
          field: 'id',
          message: `In use by ${classes} class(es), ${students} student(s), ${exams} exam(s), ${invoices} invoice(s)`,
        },
      ],
    );
  }

  await prisma.academicYear.update({
    where: { id },
    data: { deletedAt: new Date(), isCurrent: false, status: 'ARCHIVED' },
  });
}

/** Academic years must not overlap, or a student could belong to two at once. */
async function assertNoOverlap(startDate: Date, endDate: Date, excludeId?: string): Promise<void> {
  const overlapping = await prisma.academicYear.findFirst({
    where: {
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { name: true },
  });

  if (overlapping) {
    throw new ConflictError(`These dates overlap the academic year "${overlapping.name}"`, [
      { field: 'startDate', message: `Overlaps ${overlapping.name}` },
    ]);
  }
}
