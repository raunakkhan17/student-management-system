import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildOrderBy, buildPaginationMeta } from '@/utils/pagination';

export const SECTION_SORT_FIELDS = ['name', 'capacity', 'createdAt'] as const;

const sectionInclude = {
  class: {
    select: {
      id: true,
      name: true,
      code: true,
      academicYear: { select: { id: true, name: true } },
    },
  },
  classTeacher: {
    select: {
      id: true,
      employeeId: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
  room: { select: { id: true, name: true, code: true } },
  _count: { select: { students: true } },
} satisfies Prisma.SectionInclude;

export type SectionWithRelations = Prisma.SectionGetPayload<{ include: typeof sectionInclude }>;

export async function listSections(
  query: ListQueryOptions,
  filters: { classId?: string },
): Promise<PaginatedData<SectionWithRelations>> {
  const where: Prisma.SectionWhereInput = {
    deletedAt: null,
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.section.findMany({
      where,
      include: sectionInclude,
      orderBy: buildOrderBy(query.sortBy ?? 'name', query.sortOrder),
      skip: query.skip,
      take: query.take,
    }),
    prisma.section.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getSection(id: string): Promise<SectionWithRelations> {
  const section = await prisma.section.findFirst({
    where: { id, deletedAt: null },
    include: sectionInclude,
  });

  if (!section) throw new NotFoundError('Section');
  return section;
}

export async function createSection(data: Prisma.SectionUncheckedCreateInput) {
  const parent = await prisma.class.findFirst({
    where: { id: data.classId, deletedAt: null },
    select: { id: true },
  });
  if (!parent) throw new NotFoundError('Class');

  return prisma.section.create({ data, include: sectionInclude });
}

export async function updateSection(id: string, data: Prisma.SectionUncheckedUpdateInput) {
  const section = await getSection(id);

  // Capacity may not drop below the number of students already placed.
  if (typeof data.capacity === 'number' && data.capacity < section._count.students) {
    throw new ConflictError('Capacity cannot be lower than the current enrolment.', [
      {
        field: 'capacity',
        message: `${section._count.students} student(s) are already assigned to this section`,
      },
    ]);
  }

  return prisma.section.update({ where: { id }, data, include: sectionInclude });
}

export async function deleteSection(id: string): Promise<void> {
  const section = await getSection(id);

  if (section._count.students > 0) {
    throw new ConflictError('This section still has students assigned.', [
      { field: 'id', message: `${section._count.students} student(s) assigned` },
    ]);
  }

  await prisma.section.update({ where: { id }, data: { deletedAt: new Date() } });
}
