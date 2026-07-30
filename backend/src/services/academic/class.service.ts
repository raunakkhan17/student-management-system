import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildOrderBy, buildPaginationMeta } from '@/utils/pagination';

export const CLASS_SORT_FIELDS = ['name', 'code', 'yearLevel', 'capacity', 'createdAt'] as const;

const classInclude = {
  academicYear: { select: { id: true, name: true, isCurrent: true } },
  department: { select: { id: true, name: true } },
  course: { select: { id: true, name: true, code: true } },
  classTeacher: {
    select: {
      id: true,
      employeeId: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
  sections: {
    where: { deletedAt: null },
    select: { id: true, name: true, capacity: true, _count: { select: { students: true } } },
    orderBy: { name: 'asc' },
  },
  _count: { select: { students: true, classSubjects: true } },
} satisfies Prisma.ClassInclude;

export type ClassWithRelations = Prisma.ClassGetPayload<{ include: typeof classInclude }>;

export interface ClassFilters {
  academicYearId?: string;
  departmentId?: string;
  courseId?: string;
}

export async function listClasses(
  query: ListQueryOptions,
  filters: ClassFilters,
): Promise<PaginatedData<ClassWithRelations>> {
  const where: Prisma.ClassWhereInput = {
    deletedAt: null,
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.class.findMany({
      where,
      include: classInclude,
      orderBy: buildOrderBy(query.sortBy ?? 'yearLevel', query.sortOrder),
      skip: query.skip,
      take: query.take,
    }),
    prisma.class.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getClass(id: string): Promise<ClassWithRelations> {
  const record = await prisma.class.findFirst({
    where: { id, deletedAt: null },
    include: classInclude,
  });

  if (!record) throw new NotFoundError('Class');
  return record;
}

export async function createClass(data: Prisma.ClassUncheckedCreateInput) {
  return prisma.class.create({ data, include: classInclude });
}

export async function updateClass(id: string, data: Prisma.ClassUncheckedUpdateInput) {
  await getClass(id);
  return prisma.class.update({ where: { id }, data, include: classInclude });
}

export async function deleteClass(id: string): Promise<void> {
  const record = await getClass(id);

  if (record._count.students > 0) {
    throw new ConflictError('This class still has students enrolled.', [
      { field: 'id', message: `${record._count.students} student(s) enrolled` },
    ]);
  }

  await prisma.$transaction([
    prisma.section.updateMany({ where: { classId: id }, data: { deletedAt: new Date() } }),
    prisma.class.update({ where: { id }, data: { deletedAt: new Date() } }),
  ]);
}

/** Lightweight options list for pickers, without pagination overhead. */
export async function listClassOptions(academicYearId?: string) {
  return prisma.class.findMany({
    where: { deletedAt: null, ...(academicYearId ? { academicYearId } : {}) },
    select: {
      id: true,
      name: true,
      code: true,
      sections: {
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: [{ yearLevel: 'asc' }, { name: 'asc' }],
  });
}
