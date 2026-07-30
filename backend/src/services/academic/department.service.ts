import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildOrderBy, buildPaginationMeta } from '@/utils/pagination';

export const DEPARTMENT_SORT_FIELDS = ['name', 'code', 'createdAt'] as const;

const departmentInclude = {
  headTeacher: {
    select: {
      id: true,
      employeeId: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
  _count: { select: { courses: true, classes: true, subjects: true, teachers: true } },
} satisfies Prisma.DepartmentInclude;

export type DepartmentWithCounts = Prisma.DepartmentGetPayload<{
  include: typeof departmentInclude;
}>;

export async function listDepartments(
  query: ListQueryOptions,
): Promise<PaginatedData<DepartmentWithCounts>> {
  const where: Prisma.DepartmentWhereInput = {
    deletedAt: null,
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
    prisma.department.findMany({
      where,
      include: departmentInclude,
      orderBy: buildOrderBy(query.sortBy ?? 'name', query.sortOrder),
      skip: query.skip,
      take: query.take,
    }),
    prisma.department.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getDepartment(id: string): Promise<DepartmentWithCounts> {
  const department = await prisma.department.findFirst({
    where: { id, deletedAt: null },
    include: departmentInclude,
  });

  if (!department) throw new NotFoundError('Department');
  return department;
}

export async function createDepartment(data: Prisma.DepartmentUncheckedCreateInput) {
  return prisma.department.create({ data, include: departmentInclude });
}

export async function updateDepartment(id: string, data: Prisma.DepartmentUncheckedUpdateInput) {
  await getDepartment(id);
  return prisma.department.update({ where: { id }, data, include: departmentInclude });
}

export async function deleteDepartment(id: string): Promise<void> {
  const department = await getDepartment(id);
  const { courses, classes, subjects, teachers } = department._count;

  if (courses + classes + subjects + teachers > 0) {
    throw new ConflictError('This department still has courses, classes, subjects or staff.', [
      {
        field: 'id',
        message: `In use by ${courses} course(s), ${classes} class(es), ${subjects} subject(s), ${teachers} teacher(s)`,
      },
    ]);
  }

  await prisma.department.update({ where: { id }, data: { deletedAt: new Date() } });
}
