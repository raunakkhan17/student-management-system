import { Prisma, type Room, type TimetablePeriod } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildOrderBy, buildPaginationMeta } from '@/utils/pagination';
import type { BulkSlotsInput, CreateTimetableInput } from '@/validators/timetable.validator';
import { conflictsToFieldErrors, findConflicts, type SlotCandidate } from './conflict.service';

// ----------------------------------------------------------------------- Rooms

export const ROOM_SORT_FIELDS = ['name', 'code', 'capacity', 'type', 'createdAt'] as const;

export async function listRooms(
  query: ListQueryOptions,
  filters: { type?: Room['type'] },
): Promise<PaginatedData<Room>> {
  const where: Prisma.RoomWhereInput = {
    deletedAt: null,
    ...(filters.type ? { type: filters.type } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
            { building: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.room.findMany({
      where,
      orderBy: buildOrderBy(query.sortBy ?? 'name', query.sortOrder),
      skip: query.skip,
      take: query.take,
    }),
    prisma.room.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function createRoom(data: Prisma.RoomUncheckedCreateInput): Promise<Room> {
  return prisma.room.create({ data });
}

export async function updateRoom(
  id: string,
  data: Prisma.RoomUncheckedUpdateInput,
): Promise<Room> {
  const existing = await prisma.room.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Room');
  return prisma.room.update({ where: { id }, data });
}

export async function deleteRoom(id: string): Promise<void> {
  const room = await prisma.room.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { timetableSlots: true, examSchedules: true, sections: true } } },
  });

  if (!room) throw new NotFoundError('Room');

  const { timetableSlots, examSchedules, sections } = room._count;
  if (timetableSlots + examSchedules + sections > 0) {
    throw new ConflictError('This room is still allocated.', [
      {
        field: 'id',
        message: `In use by ${timetableSlots} timetable slot(s), ${examSchedules} exam(s), ${sections} section(s)`,
      },
    ]);
  }

  await prisma.room.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listRoomOptions() {
  return prisma.room.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, code: true, type: true, capacity: true },
    orderBy: { name: 'asc' },
  });
}

// --------------------------------------------------------------------- Periods

export async function listPeriods(): Promise<TimetablePeriod[]> {
  return prisma.timetablePeriod.findMany({ orderBy: { sortOrder: 'asc' } });
}

export async function createPeriod(
  data: Prisma.TimetablePeriodUncheckedCreateInput,
): Promise<TimetablePeriod> {
  return prisma.timetablePeriod.create({ data });
}

export async function updatePeriod(
  id: string,
  data: Prisma.TimetablePeriodUncheckedUpdateInput,
): Promise<TimetablePeriod> {
  const existing = await prisma.timetablePeriod.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Period');
  return prisma.timetablePeriod.update({ where: { id }, data });
}

export async function deletePeriod(id: string): Promise<void> {
  const period = await prisma.timetablePeriod.findUnique({
    where: { id },
    include: { _count: { select: { slots: true, attendanceSessions: true } } },
  });

  if (!period) throw new NotFoundError('Period');

  const { slots, attendanceSessions } = period._count;
  if (slots + attendanceSessions > 0) {
    throw new ConflictError('This period is referenced by timetables or attendance records.', [
      { field: 'id', message: `In use by ${slots} slot(s) and ${attendanceSessions} session(s)` },
    ]);
  }

  await prisma.timetablePeriod.delete({ where: { id } });
}

// ------------------------------------------------------------------ Timetables

const timetableInclude = {
  class: { select: { id: true, name: true, code: true } },
  section: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true } },
  semester: { select: { id: true, name: true } },
  slots: {
    include: {
      period: { select: { id: true, name: true, startTime: true, endTime: true, sortOrder: true, isBreak: true } },
      room: { select: { id: true, name: true, code: true, type: true } },
      teacher: {
        select: {
          id: true,
          employeeId: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      classSubject: {
        select: {
          id: true,
          isElective: true,
          subject: { select: { id: true, name: true, code: true, type: true } },
        },
      },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { period: { sortOrder: 'asc' } }],
  },
} satisfies Prisma.TimetableInclude;

export type TimetableWithSlots = Prisma.TimetableGetPayload<{ include: typeof timetableInclude }>;

export async function listTimetables(
  query: ListQueryOptions,
  filters: { classId?: string; sectionId?: string; academicYearId?: string; isActive?: boolean },
): Promise<PaginatedData<Prisma.TimetableGetPayload<{ include: typeof listInclude }>>> {
  const where: Prisma.TimetableWhereInput = {
    deletedAt: null,
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.timetable.findMany({
      where,
      include: listInclude,
      orderBy: { effectiveFrom: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.timetable.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

const listInclude = {
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true } },
  semester: { select: { id: true, name: true } },
  _count: { select: { slots: true } },
} satisfies Prisma.TimetableInclude;

export async function getTimetable(id: string): Promise<TimetableWithSlots> {
  const timetable = await prisma.timetable.findFirst({
    where: { id, deletedAt: null },
    include: timetableInclude,
  });

  if (!timetable) throw new NotFoundError('Timetable');
  return timetable;
}

export async function createTimetable(input: CreateTimetableInput): Promise<TimetableWithSlots> {
  const section = await prisma.section.findFirst({
    where: { id: input.sectionId, deletedAt: null },
    select: { classId: true },
  });

  if (!section) throw new NotFoundError('Section');
  if (section.classId !== input.classId) {
    throw new ConflictError('That section does not belong to the selected class', [
      { field: 'sectionId', message: 'Section and class do not match' },
    ]);
  }

  return prisma.$transaction(async (tx) => {
    // Only one timetable per section may be active at a time.
    if (input.isActive) {
      await tx.timetable.updateMany({
        where: { sectionId: input.sectionId, isActive: true },
        data: { isActive: false },
      });
    }

    const created = await tx.timetable.create({
      data: {
        name: input.name,
        classId: input.classId,
        sectionId: input.sectionId,
        academicYearId: input.academicYearId,
        semesterId: input.semesterId ?? null,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        isActive: input.isActive,
      },
    });

    return tx.timetable.findUniqueOrThrow({ where: { id: created.id }, include: timetableInclude });
  });
}

export async function updateTimetable(
  id: string,
  data: Prisma.TimetableUncheckedUpdateInput,
): Promise<TimetableWithSlots> {
  const existing = await getTimetable(id);

  return prisma.$transaction(async (tx) => {
    if (data.isActive === true) {
      await tx.timetable.updateMany({
        where: { sectionId: existing.sectionId, isActive: true, id: { not: id } },
        data: { isActive: false },
      });
    }

    await tx.timetable.update({ where: { id }, data });
    return tx.timetable.findUniqueOrThrow({ where: { id }, include: timetableInclude });
  });
}

export async function deleteTimetable(id: string): Promise<void> {
  await getTimetable(id);
  await prisma.timetable.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

/**
 * Replaces every slot in a timetable.
 *
 * Conflicts are evaluated against the whole submitted set before anything is
 * written, so a partially valid grid is never persisted.
 */
export async function replaceSlots(
  timetableId: string,
  input: BulkSlotsInput,
): Promise<TimetableWithSlots> {
  const timetable = await getTimetable(timetableId);

  const candidates: SlotCandidate[] = input.slots.map((slot, index) => ({
    index,
    dayOfWeek: slot.dayOfWeek,
    periodId: slot.periodId,
    teacherId: slot.teacherId ?? null,
    roomId: slot.roomId ?? null,
    classSubjectId: slot.classSubjectId ?? null,
  }));

  const conflicts = await findConflicts(timetableId, timetable.academicYearId, candidates);

  if (conflicts.length > 0) {
    throw new ConflictError(
      `${conflicts.length} scheduling conflict${conflicts.length === 1 ? '' : 's'} must be resolved first`,
      conflictsToFieldErrors(conflicts),
    );
  }

  await assertOfferingsBelongToSection(timetable.classId, timetable.sectionId, candidates);

  await prisma.$transaction([
    prisma.timetableSlot.deleteMany({ where: { timetableId } }),
    prisma.timetableSlot.createMany({
      data: input.slots.map((slot) => ({
        timetableId,
        dayOfWeek: slot.dayOfWeek,
        periodId: slot.periodId,
        classSubjectId: slot.classSubjectId ?? null,
        teacherId: slot.teacherId ?? null,
        roomId: slot.roomId ?? null,
        type: slot.type,
        note: slot.note ?? null,
      })),
    }),
  ]);

  return getTimetable(timetableId);
}

/** A slot may only reference a subject actually offered to this class/section. */
async function assertOfferingsBelongToSection(
  classId: string,
  sectionId: string,
  candidates: SlotCandidate[],
): Promise<void> {
  const offeringIds = [
    ...new Set(
      candidates.map((slot) => slot.classSubjectId).filter((id): id is string => id !== null),
    ),
  ];

  if (offeringIds.length === 0) return;

  const valid = await prisma.classSubject.count({
    where: {
      id: { in: offeringIds },
      classId,
      OR: [{ sectionId }, { sectionId: null }],
    },
  });

  if (valid !== offeringIds.length) {
    throw new ConflictError('One or more subjects are not offered to this class or section', [
      { field: 'slots', message: 'Assign the subject to this class first' },
    ]);
  }
}

/** Dry run used by the grid editor to warn before saving. */
export async function checkConflicts(timetableId: string, input: BulkSlotsInput) {
  const timetable = await getTimetable(timetableId);

  const conflicts = await findConflicts(
    timetableId,
    timetable.academicYearId,
    input.slots.map((slot, index) => ({
      index,
      dayOfWeek: slot.dayOfWeek,
      periodId: slot.periodId,
      teacherId: slot.teacherId ?? null,
      roomId: slot.roomId ?? null,
      classSubjectId: slot.classSubjectId ?? null,
    })),
  );

  return { hasConflicts: conflicts.length > 0, conflicts };
}

/** Every slot a teacher is booked for across active timetables. */
export async function getTeacherTimetable(teacherId: string, academicYearId?: string) {
  const slots = await prisma.timetableSlot.findMany({
    where: {
      teacherId,
      timetable: {
        isActive: true,
        deletedAt: null,
        ...(academicYearId ? { academicYearId } : { academicYear: { isCurrent: true } }),
      },
    },
    include: {
      period: { select: { id: true, name: true, startTime: true, endTime: true, sortOrder: true } },
      room: { select: { id: true, name: true, code: true } },
      classSubject: { select: { subject: { select: { id: true, name: true, code: true } } } },
      timetable: {
        select: {
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { period: { sortOrder: 'asc' } }],
  });

  return slots;
}

/** The active timetable for a student's section. */
export async function getStudentTimetable(studentId: string): Promise<TimetableWithSlots | null> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { sectionId: true },
  });

  if (!student) throw new NotFoundError('Student');
  if (!student.sectionId) return null;

  return prisma.timetable.findFirst({
    where: { sectionId: student.sectionId, isActive: true, deletedAt: null },
    include: timetableInclude,
  });
}
