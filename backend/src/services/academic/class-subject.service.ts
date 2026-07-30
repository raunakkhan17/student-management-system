import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';

const offeringInclude = {
  class: { select: { id: true, name: true, code: true } },
  section: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true, code: true, type: true, credits: true } },
  semester: { select: { id: true, name: true } },
  teacher: {
    select: {
      id: true,
      employeeId: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
  _count: { select: { electiveEnrollments: true } },
} satisfies Prisma.ClassSubjectInclude;

export type OfferingWithRelations = Prisma.ClassSubjectGetPayload<{
  include: typeof offeringInclude;
}>;

export interface OfferingFilters {
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  teacherId?: string;
  semesterId?: string;
  isElective?: boolean;
}

export async function listOfferings(
  query: ListQueryOptions,
  filters: OfferingFilters,
): Promise<PaginatedData<OfferingWithRelations>> {
  const where: Prisma.ClassSubjectWhereInput = {
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
    ...(filters.semesterId ? { semesterId: filters.semesterId } : {}),
    ...(filters.isElective !== undefined ? { isElective: filters.isElective } : {}),
    ...(query.search
      ? {
          subject: {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.classSubject.findMany({
      where,
      include: offeringInclude,
      orderBy: [{ subject: { name: query.sortOrder } }],
      skip: query.skip,
      take: query.take,
    }),
    prisma.classSubject.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getOffering(id: string): Promise<OfferingWithRelations> {
  const offering = await prisma.classSubject.findUnique({
    where: { id },
    include: offeringInclude,
  });

  if (!offering) throw new NotFoundError('Subject offering');
  return offering;
}

/**
 * Creates a subject offering.
 *
 * Postgres treats NULLs as distinct in unique indexes, so the composite
 * unique on (classId, sectionId, subjectId, semesterId) does not prevent
 * duplicates when sectionId or semesterId are null — this check does.
 */
export async function createOffering(data: Prisma.ClassSubjectUncheckedCreateInput) {
  const duplicate = await prisma.classSubject.findFirst({
    where: {
      classId: data.classId,
      subjectId: data.subjectId,
      sectionId: data.sectionId ?? null,
      semesterId: data.semesterId ?? null,
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new ConflictError('This subject is already offered to that class or section.', [
      { field: 'subjectId', message: 'Duplicate subject offering' },
    ]);
  }

  return prisma.classSubject.create({ data, include: offeringInclude });
}

export async function updateOffering(id: string, data: Prisma.ClassSubjectUncheckedUpdateInput) {
  await getOffering(id);
  return prisma.classSubject.update({ where: { id }, data, include: offeringInclude });
}

export async function deleteOffering(id: string): Promise<void> {
  const offering = await getOffering(id);

  if (offering._count.electiveEnrollments > 0) {
    throw new ConflictError('Students have already chosen this elective.', [
      { field: 'id', message: `${offering._count.electiveEnrollments} enrolment(s)` },
    ]);
  }

  // Timetable slots reference offerings with SetNull, so removal is safe here.
  await prisma.classSubject.delete({ where: { id } });
}

/** Replaces a student's elective selections for the offerings supplied. */
export async function setStudentElectives(
  studentId: string,
  classSubjectIds: string[],
): Promise<{ enrolled: number }> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { id: true, classId: true },
  });
  if (!student) throw new NotFoundError('Student');

  if (classSubjectIds.length > 0) {
    const offerings = await prisma.classSubject.findMany({
      where: { id: { in: classSubjectIds } },
      select: { id: true, classId: true, isElective: true },
    });

    if (offerings.length !== classSubjectIds.length) {
      throw new NotFoundError('One or more subject offerings');
    }

    const invalid = offerings.filter(
      (offering) => !offering.isElective || offering.classId !== student.classId,
    );

    if (invalid.length > 0) {
      throw new ConflictError(
        'Every selection must be an elective offered to this student’s class.',
        invalid.map((offering) => ({
          field: 'classSubjectIds',
          message: `Offering ${offering.id} is not a valid elective for this student`,
        })),
      );
    }
  }

  await prisma.$transaction([
    prisma.studentElective.deleteMany({ where: { studentId } }),
    prisma.studentElective.createMany({
      data: classSubjectIds.map((classSubjectId) => ({ studentId, classSubjectId })),
      skipDuplicates: true,
    }),
  ]);

  return { enrolled: classSubjectIds.length };
}

export async function listStudentElectives(studentId: string) {
  return prisma.studentElective.findMany({
    where: { studentId },
    include: { classSubject: { include: offeringInclude } },
  });
}
