import type { Prisma, SubjectType } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildOrderBy, buildPaginationMeta } from '@/utils/pagination';

export const SUBJECT_SORT_FIELDS = ['name', 'code', 'credits', 'type', 'createdAt'] as const;

const subjectInclude = {
  department: { select: { id: true, name: true, code: true } },
  _count: { select: { classSubjects: true, teacherSubjects: true } },
} satisfies Prisma.SubjectInclude;

export type SubjectWithRelations = Prisma.SubjectGetPayload<{ include: typeof subjectInclude }>;

export interface SubjectFilters {
  departmentId?: string;
  type?: SubjectType;
}

export async function listSubjects(
  query: ListQueryOptions,
  filters: SubjectFilters,
): Promise<PaginatedData<SubjectWithRelations>> {
  const where: Prisma.SubjectWhereInput = {
    deletedAt: null,
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
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
    prisma.subject.findMany({
      where,
      include: subjectInclude,
      orderBy: buildOrderBy(query.sortBy ?? 'name', query.sortOrder),
      skip: query.skip,
      take: query.take,
    }),
    prisma.subject.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getSubject(id: string): Promise<SubjectWithRelations> {
  const subject = await prisma.subject.findFirst({
    where: { id, deletedAt: null },
    include: subjectInclude,
  });

  if (!subject) throw new NotFoundError('Subject');
  return subject;
}

export async function createSubject(data: Prisma.SubjectUncheckedCreateInput) {
  return prisma.subject.create({ data, include: subjectInclude });
}

export async function updateSubject(id: string, data: Prisma.SubjectUncheckedUpdateInput) {
  await getSubject(id);
  return prisma.subject.update({ where: { id }, data, include: subjectInclude });
}

export async function deleteSubject(id: string): Promise<void> {
  const subject = await getSubject(id);

  if (subject._count.classSubjects > 0) {
    throw new ConflictError('This subject is still offered to one or more classes.', [
      { field: 'id', message: `Offered in ${subject._count.classSubjects} class(es)` },
    ]);
  }

  await prisma.subject.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listSubjectOptions() {
  return prisma.subject.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, code: true, type: true, credits: true },
    orderBy: { name: 'asc' },
  });
}
