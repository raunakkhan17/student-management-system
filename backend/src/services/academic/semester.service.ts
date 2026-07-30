import type { AcademicTermStatus, Prisma } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildOrderBy, buildPaginationMeta } from '@/utils/pagination';

export const SEMESTER_SORT_FIELDS = ['name', 'startDate', 'endDate', 'createdAt'] as const;

const semesterInclude = {
  academicYear: { select: { id: true, name: true, startDate: true, endDate: true } },
  _count: { select: { classSubjects: true, exams: true } },
} satisfies Prisma.SemesterInclude;

export type SemesterWithRelations = Prisma.SemesterGetPayload<{ include: typeof semesterInclude }>;

export async function listSemesters(
  query: ListQueryOptions,
  filters: { academicYearId?: string; status?: AcademicTermStatus },
): Promise<PaginatedData<SemesterWithRelations>> {
  const where: Prisma.SemesterWhereInput = {
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.semester.findMany({
      where,
      include: semesterInclude,
      orderBy: buildOrderBy(query.sortBy ?? 'startDate', query.sortOrder),
      skip: query.skip,
      take: query.take,
    }),
    prisma.semester.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getSemester(id: string): Promise<SemesterWithRelations> {
  const semester = await prisma.semester.findUnique({ where: { id }, include: semesterInclude });
  if (!semester) throw new NotFoundError('Semester');
  return semester;
}

export async function createSemester(data: Prisma.SemesterUncheckedCreateInput) {
  await assertWithinAcademicYear(data.academicYearId, data.startDate as Date, data.endDate as Date);
  return prisma.semester.create({ data, include: semesterInclude });
}

export async function updateSemester(id: string, data: Prisma.SemesterUncheckedUpdateInput) {
  const existing = await getSemester(id);

  const startDate = (data.startDate as Date | undefined) ?? existing.startDate;
  const endDate = (data.endDate as Date | undefined) ?? existing.endDate;
  await assertWithinAcademicYear(existing.academicYearId, startDate, endDate);

  return prisma.semester.update({ where: { id }, data, include: semesterInclude });
}

export async function deleteSemester(id: string): Promise<void> {
  const semester = await getSemester(id);
  const { classSubjects, exams } = semester._count;

  if (classSubjects + exams > 0) {
    throw new ConflictError('This semester still has subject offerings or exams.', [
      { field: 'id', message: `In use by ${classSubjects} offering(s) and ${exams} exam(s)` },
    ]);
  }

  await prisma.semester.delete({ where: { id } });
}

/** A semester must sit inside the bounds of its academic year. */
async function assertWithinAcademicYear(
  academicYearId: string,
  startDate: Date,
  endDate: Date,
): Promise<void> {
  const year = await prisma.academicYear.findFirst({
    where: { id: academicYearId, deletedAt: null },
    select: { name: true, startDate: true, endDate: true },
  });

  if (!year) throw new NotFoundError('Academic year');

  if (startDate < year.startDate || endDate > year.endDate) {
    throw new ConflictError(`Semester dates must fall within ${year.name}.`, [
      {
        field: 'startDate',
        message: `${year.name} runs from ${year.startDate.toISOString().slice(0, 10)} to ${year.endDate.toISOString().slice(0, 10)}`,
      },
    ]);
  }
}
