import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildOrderBy, buildPaginationMeta } from '@/utils/pagination';

export const COURSE_SORT_FIELDS = ['name', 'code', 'durationYears', 'createdAt'] as const;

const courseInclude = {
  department: { select: { id: true, name: true, code: true } },
  _count: { select: { classes: true } },
} satisfies Prisma.CourseInclude;

export type CourseWithDepartment = Prisma.CourseGetPayload<{ include: typeof courseInclude }>;

export async function listCourses(
  query: ListQueryOptions,
  filters: { departmentId?: string },
): Promise<PaginatedData<CourseWithDepartment>> {
  const where: Prisma.CourseWhereInput = {
    deletedAt: null,
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
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
    prisma.course.findMany({
      where,
      include: courseInclude,
      orderBy: buildOrderBy(query.sortBy ?? 'name', query.sortOrder),
      skip: query.skip,
      take: query.take,
    }),
    prisma.course.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getCourse(id: string): Promise<CourseWithDepartment> {
  const course = await prisma.course.findFirst({
    where: { id, deletedAt: null },
    include: courseInclude,
  });

  if (!course) throw new NotFoundError('Course');
  return course;
}

export async function createCourse(data: Prisma.CourseUncheckedCreateInput) {
  return prisma.course.create({ data, include: courseInclude });
}

export async function updateCourse(id: string, data: Prisma.CourseUncheckedUpdateInput) {
  await getCourse(id);
  return prisma.course.update({ where: { id }, data, include: courseInclude });
}

export async function deleteCourse(id: string): Promise<void> {
  const course = await getCourse(id);

  if (course._count.classes > 0) {
    throw new ConflictError('This course still has classes linked to it.', [
      { field: 'id', message: `In use by ${course._count.classes} class(es)` },
    ]);
  }

  await prisma.course.update({ where: { id }, data: { deletedAt: new Date() } });
}
