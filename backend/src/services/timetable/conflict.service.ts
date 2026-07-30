import type { DayOfWeek, Prisma } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ApiFieldError } from '@/types/api';

export interface SlotCandidate {
  /** Index in the submitted batch, used to point the error at the right cell. */
  index: number;
  dayOfWeek: DayOfWeek;
  periodId: string;
  teacherId: string | null;
  roomId: string | null;
  classSubjectId: string | null;
}

export interface ConflictDetail {
  index: number;
  kind: 'TEACHER' | 'ROOM' | 'DUPLICATE_CELL';
  message: string;
}

/**
 * Detects timetable clashes (PRD Module 9 — Conflict Validation).
 *
 * Three distinct rules:
 *  1. DUPLICATE_CELL — two submitted slots target the same day + period.
 *  2. TEACHER — a teacher is already booked elsewhere at that day + period.
 *  3. ROOM — a room is already booked elsewhere at that day + period.
 *
 * Rules 2 and 3 cannot be expressed as a database unique index, because the
 * clashing rows live in *different* timetables. They are therefore checked here
 * against every other active timetable for the same academic year.
 */
export async function findConflicts(
  timetableId: string,
  academicYearId: string,
  candidates: SlotCandidate[],
): Promise<ConflictDetail[]> {
  const conflicts: ConflictDetail[] = [];

  // --- Rule 1: duplicates inside the submitted batch ---
  const seenCells = new Map<string, number>();
  for (const candidate of candidates) {
    const cellKey = `${candidate.dayOfWeek}:${candidate.periodId}`;
    const firstIndex = seenCells.get(cellKey);

    if (firstIndex !== undefined) {
      conflicts.push({
        index: candidate.index,
        kind: 'DUPLICATE_CELL',
        message: `This day and period is already filled by slot ${firstIndex + 1}`,
      });
    } else {
      seenCells.set(cellKey, candidate.index);
    }
  }

  const teacherIds = [
    ...new Set(candidates.map((slot) => slot.teacherId).filter((id): id is string => id !== null)),
  ];
  const roomIds = [
    ...new Set(candidates.map((slot) => slot.roomId).filter((id): id is string => id !== null)),
  ];

  if (teacherIds.length === 0 && roomIds.length === 0) {
    return conflicts;
  }

  // Only *active* timetables in the same year can genuinely clash — a draft or
  // a superseded timetable does not occupy anyone's time.
  const otherSlotsWhere: Prisma.TimetableSlotWhereInput = {
    timetableId: { not: timetableId },
    timetable: { isActive: true, deletedAt: null, academicYearId },
    OR: [
      ...(teacherIds.length ? [{ teacherId: { in: teacherIds } }] : []),
      ...(roomIds.length ? [{ roomId: { in: roomIds } }] : []),
    ],
  };

  const existing = await prisma.timetableSlot.findMany({
    where: otherSlotsWhere,
    select: {
      dayOfWeek: true,
      periodId: true,
      teacherId: true,
      roomId: true,
      timetable: {
        select: {
          name: true,
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
      period: { select: { name: true } },
    },
  });

  const teacherBookings = new Map<string, (typeof existing)[number]>();
  const roomBookings = new Map<string, (typeof existing)[number]>();

  for (const slot of existing) {
    if (slot.teacherId) {
      teacherBookings.set(`${slot.teacherId}:${slot.dayOfWeek}:${slot.periodId}`, slot);
    }
    if (slot.roomId) {
      roomBookings.set(`${slot.roomId}:${slot.dayOfWeek}:${slot.periodId}`, slot);
    }
  }

  const describe = (slot: (typeof existing)[number]): string =>
    `${slot.timetable.class.name} — ${slot.timetable.section.name} (${slot.period.name})`;

  for (const candidate of candidates) {
    if (candidate.teacherId) {
      const clash = teacherBookings.get(
        `${candidate.teacherId}:${candidate.dayOfWeek}:${candidate.periodId}`,
      );
      if (clash) {
        conflicts.push({
          index: candidate.index,
          kind: 'TEACHER',
          message: `This teacher is already teaching ${describe(clash)} at that time`,
        });
      }
    }

    if (candidate.roomId) {
      const clash = roomBookings.get(
        `${candidate.roomId}:${candidate.dayOfWeek}:${candidate.periodId}`,
      );
      if (clash) {
        conflicts.push({
          index: candidate.index,
          kind: 'ROOM',
          message: `This room is already booked for ${describe(clash)} at that time`,
        });
      }
    }
  }

  return conflicts;
}

/** Formats conflicts as field errors the client can attach to grid cells. */
export function conflictsToFieldErrors(conflicts: ConflictDetail[]): ApiFieldError[] {
  return conflicts.map((conflict) => ({
    field: `slots.${conflict.index}`,
    message: conflict.message,
    code: conflict.kind,
  }));
}
