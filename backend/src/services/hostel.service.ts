import { Prisma, type AllocationStatus, type HostelRoomStatus } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import type { AuthenticatedUser } from '@/types/auth';
import { BadRequestError, ConflictError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';
import type {
  AllocateRoomInput,
  BulkRoomsInput,
  CreateComplaintInput,
  CreateVisitorInput,
  RoomTransferInput,
} from '@/validators/facility.validator';

// -------------------------------------------------------------------- Hostels

const hostelInclude = {
  warden: {
    select: {
      id: true,
      employeeId: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
  _count: { select: { rooms: true, complaints: true, messPlans: true } },
} satisfies Prisma.HostelInclude;

export async function listHostels(query: ListQueryOptions) {
  const where: Prisma.HostelWhereInput = {
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
    prisma.hostel.findMany({
      where,
      include: hostelInclude,
      orderBy: { name: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.hostel.count({ where }),
  ]);

  // Occupancy is aggregated separately so the list can show utilisation.
  const occupancy = await prisma.hostelRoom.groupBy({
    by: ['hostelId'],
    where: { hostelId: { in: items.map((hostel) => hostel.id) }, deletedAt: null },
    _sum: { capacity: true, occupied: true },
  });

  const occupancyByHostel = new Map(occupancy.map((row) => [row.hostelId, row]));

  return {
    items: items.map((hostel) => {
      const stats = occupancyByHostel.get(hostel.id);
      const capacity = stats?._sum.capacity ?? 0;
      const occupied = stats?._sum.occupied ?? 0;

      return {
        ...hostel,
        capacity,
        occupied,
        occupancyPercent: capacity === 0 ? null : Number(((occupied / capacity) * 100).toFixed(1)),
      };
    }),
    pagination: buildPaginationMeta(totalItems, query),
  };
}

export async function getHostel(id: string) {
  const hostel = await prisma.hostel.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...hostelInclude,
      rooms: {
        where: { deletedAt: null },
        orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }],
      },
      messPlans: { where: { isActive: true } },
    },
  });

  if (!hostel) throw new NotFoundError('Hostel');
  return hostel;
}

export async function createHostel(data: Prisma.HostelUncheckedCreateInput) {
  return prisma.hostel.create({ data, include: hostelInclude });
}

export async function updateHostel(id: string, data: Prisma.HostelUncheckedUpdateInput) {
  const existing = await prisma.hostel.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Hostel');
  return prisma.hostel.update({ where: { id }, data, include: hostelInclude });
}

export async function deleteHostel(id: string): Promise<void> {
  const hostel = await prisma.hostel.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      rooms: {
        where: { deletedAt: null, occupied: { gt: 0 } },
        select: { id: true },
      },
    },
  });

  if (!hostel) throw new NotFoundError('Hostel');

  if (hostel.rooms.length > 0) {
    throw new ConflictError('This hostel still has occupied rooms.', [
      { field: 'id', message: `${hostel.rooms.length} room(s) occupied` },
    ]);
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.hostelRoom.updateMany({ where: { hostelId: id }, data: { deletedAt: now } }),
    prisma.hostel.update({ where: { id }, data: { deletedAt: now } }),
  ]);
}

// ---------------------------------------------------------------------- Rooms

const roomInclude = {
  hostel: { select: { id: true, name: true, code: true, type: true } },
  allocations: {
    where: { status: 'ACTIVE' },
    include: {
      student: {
        select: {
          id: true,
          admissionNumber: true,
          user: { select: { firstName: true, lastName: true } },
          class: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.HostelRoomInclude;

export type RoomRecord = Prisma.HostelRoomGetPayload<{ include: typeof roomInclude }>;

export async function listRooms(
  query: ListQueryOptions,
  filters: {
    hostelId?: string;
    status?: HostelRoomStatus[];
    type?: Prisma.HostelRoomWhereInput['type'];
    onlyAvailable?: boolean;
  },
): Promise<PaginatedData<RoomRecord>> {
  const where: Prisma.HostelRoomWhereInput = {
    deletedAt: null,
    ...(filters.hostelId ? { hostelId: filters.hostelId } : {}),
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    // "Available" means a free bed, not merely the AVAILABLE status flag.
    ...(filters.onlyAvailable
      ? { status: { notIn: ['MAINTENANCE', 'RESERVED'] }, occupied: { lt: prisma.hostelRoom.fields.capacity } }
      : {}),
    ...(query.search ? { roomNumber: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.hostelRoom.findMany({
      where,
      include: roomInclude,
      orderBy: [{ floor: 'asc' }, { roomNumber: query.sortOrder }],
      skip: query.skip,
      take: query.take,
    }),
    prisma.hostelRoom.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function createRoom(data: Prisma.HostelRoomUncheckedCreateInput) {
  const hostel = await prisma.hostel.findFirst({
    where: { id: data.hostelId, deletedAt: null },
    select: { id: true },
  });

  if (!hostel) throw new NotFoundError('Hostel');

  return prisma.hostelRoom.create({ data, include: roomInclude });
}

/** Creates a numbered block of rooms in one go. */
export async function createRoomsInBulk(
  input: BulkRoomsInput,
): Promise<{ created: number; skipped: string[] }> {
  const hostel = await prisma.hostel.findFirst({
    where: { id: input.hostelId, deletedAt: null },
    select: { id: true },
  });

  if (!hostel) throw new NotFoundError('Hostel');

  const numbers: string[] = [];
  for (let value = input.fromNumber; value <= input.toNumber; value += 1) {
    numbers.push(`${input.prefix ?? ''}${value}`);
  }

  // Room numbers are unique per hostel, so pre-filter rather than fail the batch.
  const existing = await prisma.hostelRoom.findMany({
    where: { hostelId: input.hostelId, roomNumber: { in: numbers } },
    select: { roomNumber: true },
  });

  const taken = new Set(existing.map((room) => room.roomNumber));
  const toCreate = numbers.filter((number) => !taken.has(number));

  if (toCreate.length > 0) {
    await prisma.hostelRoom.createMany({
      data: toCreate.map((roomNumber) => ({
        hostelId: input.hostelId,
        roomNumber,
        floor: input.floor ?? null,
        type: input.type,
        capacity: input.capacity,
        monthlyRent: input.monthlyRent,
        status: 'AVAILABLE' as const,
      })),
    });
  }

  return { created: toCreate.length, skipped: [...taken] };
}

export async function updateRoom(id: string, data: Prisma.HostelRoomUncheckedUpdateInput) {
  const room = await prisma.hostelRoom.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, occupied: true },
  });

  if (!room) throw new NotFoundError('Room');

  // Capacity may not drop below the number of students already in the room.
  if (typeof data.capacity === 'number' && data.capacity < room.occupied) {
    throw new ConflictError('Capacity cannot be below the current occupancy.', [
      { field: 'capacity', message: `${room.occupied} bed(s) are occupied` },
    ]);
  }

  return prisma.hostelRoom.update({ where: { id }, data, include: roomInclude });
}

export async function deleteRoom(id: string): Promise<void> {
  const room = await prisma.hostelRoom.findFirst({
    where: { id, deletedAt: null },
    select: { occupied: true },
  });

  if (!room) throw new NotFoundError('Room');

  if (room.occupied > 0) {
    throw new ConflictError('This room is occupied. Vacate it before removing the room.');
  }

  await prisma.hostelRoom.update({ where: { id }, data: { deletedAt: new Date() } });
}

/** Recomputes a room's occupancy and status from its active allocations. */
async function syncRoomOccupancy(
  tx: Prisma.TransactionClient,
  roomId: string,
): Promise<void> {
  const room = await tx.hostelRoom.findUniqueOrThrow({
    where: { id: roomId },
    select: { capacity: true, status: true },
  });

  const occupied = await tx.hostelAllocation.count({
    where: { roomId, status: 'ACTIVE' },
  });

  // MAINTENANCE and RESERVED are administrative states that occupancy must not
  // silently override.
  const status: HostelRoomStatus =
    room.status === 'MAINTENANCE' || room.status === 'RESERVED'
      ? room.status
      : occupied === 0
        ? 'AVAILABLE'
        : occupied >= room.capacity
          ? 'FULL'
          : 'PARTIALLY_OCCUPIED';

  await tx.hostelRoom.update({ where: { id: roomId }, data: { occupied, status } });
}

// ---------------------------------------------------------------- Allocations

const allocationInclude = {
  room: {
    select: {
      id: true,
      roomNumber: true,
      floor: true,
      type: true,
      capacity: true,
      occupied: true,
      monthlyRent: true,
      hostel: { select: { id: true, name: true, code: true } },
    },
  },
  student: {
    select: {
      id: true,
      admissionNumber: true,
      gender: true,
      user: { select: { firstName: true, lastName: true, phone: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  },
  allocatedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.HostelAllocationInclude;

export type AllocationRecord = Prisma.HostelAllocationGetPayload<{
  include: typeof allocationInclude;
}>;

/**
 * Allocates a bed to a student.
 *
 * Capacity, gender suitability and existing allocations are all checked inside
 * the transaction, so two concurrent allocations cannot oversubscribe a room.
 */
export async function allocateRoom(
  input: AllocateRoomInput,
  allocatedById: string,
): Promise<AllocationRecord> {
  return prisma.$transaction(async (tx) => {
    const [room, student] = await Promise.all([
      tx.hostelRoom.findFirst({
        where: { id: input.roomId, deletedAt: null },
        select: {
          id: true,
          roomNumber: true,
          capacity: true,
          status: true,
          hostel: { select: { id: true, name: true, type: true } },
        },
      }),
      tx.student.findFirst({
        where: { id: input.studentId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true, gender: true },
      }),
    ]);

    if (!room) throw new NotFoundError('Room');
    if (!student) throw new NotFoundError('Student');

    if (room.status === 'MAINTENANCE') {
      throw new ConflictError('This room is under maintenance and cannot be allocated');
    }

    // A boys' hostel takes male students, a girls' hostel female; MIXED takes any.
    const hostelType = room.hostel.type;
    const isGenderMismatch =
      (hostelType === 'BOYS' && student.gender !== 'MALE') ||
      (hostelType === 'GIRLS' && student.gender !== 'FEMALE');

    if (isGenderMismatch) {
      throw new ConflictError(
        `${room.hostel.name} is a ${hostelType.toLowerCase()} hostel and cannot accommodate this student.`,
        [{ field: 'roomId', message: 'Hostel type does not match the student' }],
      );
    }

    const alreadyAllocated = await tx.hostelAllocation.findFirst({
      where: { studentId: input.studentId, status: 'ACTIVE' },
      select: { id: true, room: { select: { roomNumber: true } } },
    });

    if (alreadyAllocated) {
      throw new ConflictError(
        `This student already occupies room ${alreadyAllocated.room.roomNumber}. Use a room transfer instead.`,
        [{ field: 'studentId', message: 'Already allocated' }],
      );
    }

    const occupied = await tx.hostelAllocation.count({
      where: { roomId: input.roomId, status: 'ACTIVE' },
    });

    if (occupied >= room.capacity) {
      throw new ConflictError(`Room ${room.roomNumber} is full (${room.capacity} bed(s)).`, [
        { field: 'roomId', message: 'No beds remaining' },
      ]);
    }

    const allocation = await tx.hostelAllocation.create({
      data: {
        roomId: input.roomId,
        studentId: input.studentId,
        bedNumber: input.bedNumber ?? null,
        allocatedFrom: input.allocatedFrom,
        status: 'ACTIVE',
        allocatedById,
        remarks: input.remarks ?? null,
      },
    });

    await syncRoomOccupancy(tx, input.roomId);

    await tx.studentTimelineEvent.create({
      data: {
        studentId: input.studentId,
        type: 'GENERAL',
        title: `Allocated hostel room ${room.roomNumber}`,
        description: room.hostel.name,
        occurredAt: input.allocatedFrom,
        createdById: allocatedById,
      },
    });

    return tx.hostelAllocation.findUniqueOrThrow({
      where: { id: allocation.id },
      include: allocationInclude,
    });
  });
}

export async function vacateRoom(
  allocationId: string,
  input: { allocatedTo: Date; remarks?: string },
): Promise<AllocationRecord> {
  return prisma.$transaction(async (tx) => {
    const allocation = await tx.hostelAllocation.findUnique({
      where: { id: allocationId },
      select: { id: true, roomId: true, status: true, allocatedFrom: true },
    });

    if (!allocation) throw new NotFoundError('Allocation');

    if (allocation.status !== 'ACTIVE') {
      throw new ConflictError(`This allocation is already ${allocation.status.toLowerCase()}`);
    }

    if (input.allocatedTo < allocation.allocatedFrom) {
      throw new BadRequestError('The vacate date cannot be before the allocation date', [
        { field: 'allocatedTo', message: 'Choose a later date' },
      ]);
    }

    await tx.hostelAllocation.update({
      where: { id: allocationId },
      data: { status: 'VACATED', allocatedTo: input.allocatedTo, remarks: input.remarks ?? null },
    });

    await syncRoomOccupancy(tx, allocation.roomId);

    return tx.hostelAllocation.findUniqueOrThrow({
      where: { id: allocationId },
      include: allocationInclude,
    });
  });
}

export async function listAllocations(
  query: ListQueryOptions,
  filters: {
    hostelId?: string;
    roomId?: string;
    studentId?: string;
    status?: AllocationStatus[];
  },
): Promise<PaginatedData<AllocationRecord>> {
  const where: Prisma.HostelAllocationWhereInput = {
    ...(filters.hostelId ? { room: { hostelId: filters.hostelId } } : {}),
    ...(filters.roomId ? { roomId: filters.roomId } : {}),
    ...(filters.studentId ? { studentId: filters.studentId } : {}),
    ...(filters.status?.length ? { status: { in: filters.status } } : { status: 'ACTIVE' }),
    ...(query.search
      ? {
          OR: [
            { student: { admissionNumber: { contains: query.search, mode: 'insensitive' } } },
            { student: { user: { firstName: { contains: query.search, mode: 'insensitive' } } } },
            { student: { user: { lastName: { contains: query.search, mode: 'insensitive' } } } },
            { room: { roomNumber: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.hostelAllocation.findMany({
      where,
      include: allocationInclude,
      orderBy: { allocatedFrom: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.hostelAllocation.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

// ------------------------------------------------------------- Room transfers

const transferInclude = {
  student: {
    select: {
      id: true,
      admissionNumber: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
  fromRoom: { select: { id: true, roomNumber: true, hostel: { select: { name: true } } } },
  toRoom: { select: { id: true, roomNumber: true, capacity: true, occupied: true, hostel: { select: { name: true } } } },
  approvedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.RoomTransferInclude;

export async function requestRoomTransfer(input: RoomTransferInput) {
  const current = await prisma.hostelAllocation.findFirst({
    where: { studentId: input.studentId, status: 'ACTIVE' },
    select: { roomId: true },
  });

  if (!current) {
    throw new ConflictError('This student does not currently occupy a room');
  }

  if (current.roomId === input.toRoomId) {
    throw new BadRequestError('The student already occupies that room', [
      { field: 'toRoomId', message: 'Choose a different room' },
    ]);
  }

  const target = await prisma.hostelRoom.findFirst({
    where: { id: input.toRoomId, deletedAt: null },
    select: { id: true },
  });

  if (!target) throw new NotFoundError('Target room');

  const pending = await prisma.roomTransfer.findFirst({
    where: { studentId: input.studentId, status: 'PENDING' },
    select: { id: true },
  });

  if (pending) {
    throw new ConflictError('This student already has a pending transfer request');
  }

  return prisma.roomTransfer.create({
    data: {
      studentId: input.studentId,
      fromRoomId: current.roomId,
      toRoomId: input.toRoomId,
      reason: input.reason,
      status: 'PENDING',
      effectiveDate: input.effectiveDate ?? null,
    },
    include: transferInclude,
  });
}

/** Approving a transfer moves the student and rebalances both rooms. */
export async function reviewRoomTransfer(
  id: string,
  input: { status: 'APPROVED' | 'REJECTED'; reviewComment?: string; effectiveDate?: Date },
  approvedById: string,
) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.roomTransfer.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        studentId: true,
        fromRoomId: true,
        toRoomId: true,
        toRoom: { select: { capacity: true, roomNumber: true, status: true } },
      },
    });

    if (!transfer) throw new NotFoundError('Transfer request');

    if (transfer.status !== 'PENDING') {
      throw new ConflictError(`This request has already been ${transfer.status.toLowerCase()}`);
    }

    const effectiveDate = input.effectiveDate ?? new Date();

    if (input.status === 'REJECTED') {
      await tx.roomTransfer.update({
        where: { id },
        data: {
          status: 'REJECTED',
          approvedById,
          reviewComment: input.reviewComment ?? null,
        },
      });

      return tx.roomTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
    }

    // Capacity is re-checked at approval time, not request time — the room may
    // have filled up while the request was waiting.
    const occupied = await tx.hostelAllocation.count({
      where: { roomId: transfer.toRoomId, status: 'ACTIVE' },
    });

    if (occupied >= transfer.toRoom.capacity) {
      throw new ConflictError(
        `Room ${transfer.toRoom.roomNumber} filled up while this request was pending.`,
        [{ field: 'toRoomId', message: 'No beds remaining' }],
      );
    }

    // Close the old allocation and open the new one.
    await tx.hostelAllocation.updateMany({
      where: { studentId: transfer.studentId, roomId: transfer.fromRoomId, status: 'ACTIVE' },
      data: { status: 'TRANSFERRED', allocatedTo: effectiveDate },
    });

    await tx.hostelAllocation.create({
      data: {
        roomId: transfer.toRoomId,
        studentId: transfer.studentId,
        allocatedFrom: effectiveDate,
        status: 'ACTIVE',
        allocatedById: approvedById,
        remarks: `Transferred from a previous room on ${effectiveDate.toISOString().slice(0, 10)}`,
      },
    });

    await syncRoomOccupancy(tx, transfer.fromRoomId);
    await syncRoomOccupancy(tx, transfer.toRoomId);

    await tx.roomTransfer.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById,
        reviewComment: input.reviewComment ?? null,
        effectiveDate,
      },
    });

    await tx.studentTimelineEvent.create({
      data: {
        studentId: transfer.studentId,
        type: 'TRANSFER',
        title: `Hostel room transfer to ${transfer.toRoom.roomNumber}`,
        description: input.reviewComment ?? null,
        occurredAt: effectiveDate,
        createdById: approvedById,
      },
    });

    return tx.roomTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
  });
}

export async function listRoomTransfers(query: ListQueryOptions, status?: string) {
  const where: Prisma.RoomTransferWhereInput = {
    ...(status ? { status: status as never } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.roomTransfer.findMany({
      where,
      include: transferInclude,
      orderBy: { requestedAt: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.roomTransfer.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

// -------------------------------------------------------------------- Visitors

const visitorInclude = {
  hostel: { select: { id: true, name: true } },
  student: {
    select: {
      id: true,
      admissionNumber: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
  approvedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.HostelVisitorInclude;

export async function logVisitor(input: CreateVisitorInput, approvedById: string) {
  const allocation = await prisma.hostelAllocation.findFirst({
    where: { studentId: input.studentId, status: 'ACTIVE', room: { hostelId: input.hostelId } },
    select: { id: true },
  });

  if (!allocation) {
    throw new ConflictError('This student is not currently resident in that hostel', [
      { field: 'studentId', message: 'No active allocation in this hostel' },
    ]);
  }

  return prisma.hostelVisitor.create({
    data: {
      hostelId: input.hostelId,
      studentId: input.studentId,
      visitorName: input.visitorName,
      relation: input.relation,
      phone: input.phone,
      idProofType: input.idProofType ?? null,
      idProofNumber: input.idProofNumber ?? null,
      purpose: input.purpose ?? null,
      checkInAt: input.checkInAt,
      approvedById,
    },
    include: visitorInclude,
  });
}

export async function checkOutVisitor(id: string, checkOutAt: Date) {
  const visitor = await prisma.hostelVisitor.findUnique({
    where: { id },
    select: { checkInAt: true, checkOutAt: true },
  });

  if (!visitor) throw new NotFoundError('Visitor record');

  if (visitor.checkOutAt) {
    throw new ConflictError('This visitor has already been checked out');
  }

  if (checkOutAt < visitor.checkInAt) {
    throw new BadRequestError('Check-out cannot be before check-in', [
      { field: 'checkOutAt', message: 'Choose a later time' },
    ]);
  }

  return prisma.hostelVisitor.update({
    where: { id },
    data: { checkOutAt },
    include: visitorInclude,
  });
}

export async function listVisitors(
  query: ListQueryOptions,
  filters: {
    hostelId?: string;
    studentId?: string;
    onlyInside?: boolean;
    from?: Date;
    to?: Date;
  },
) {
  const where: Prisma.HostelVisitorWhereInput = {
    ...(filters.hostelId ? { hostelId: filters.hostelId } : {}),
    ...(filters.studentId ? { studentId: filters.studentId } : {}),
    ...(filters.onlyInside ? { checkOutAt: null } : {}),
    ...(filters.from || filters.to
      ? {
          checkInAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { visitorName: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.hostelVisitor.findMany({
      where,
      include: visitorInclude,
      orderBy: { checkInAt: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.hostelVisitor.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

// ------------------------------------------------------------------ Mess plans

export async function listMessPlans(hostelId?: string) {
  return prisma.messPlan.findMany({
    where: { ...(hostelId ? { hostelId } : {}) },
    include: {
      hostel: { select: { id: true, name: true } },
      _count: { select: { subscriptions: true } },
    },
    orderBy: { name: 'asc' },
  });
}

export async function createMessPlan(data: Prisma.MessPlanUncheckedCreateInput) {
  return prisma.messPlan.create({
    data,
    include: { hostel: { select: { id: true, name: true } } },
  });
}

export async function subscribeToMessPlan(input: {
  studentId: string;
  messPlanId: string;
  startDate: Date;
  endDate?: Date;
}) {
  const [student, plan] = await Promise.all([
    prisma.student.findFirst({
      where: { id: input.studentId, deletedAt: null },
      select: { id: true },
    }),
    prisma.messPlan.findFirst({
      where: { id: input.messPlanId, isActive: true },
      select: { id: true },
    }),
  ]);

  if (!student) throw new NotFoundError('Student');
  if (!plan) throw new NotFoundError('Mess plan');

  return prisma.$transaction(async (tx) => {
    // A student eats on one plan at a time; close any active subscription.
    await tx.studentMessPlan.updateMany({
      where: { studentId: input.studentId, status: 'ACTIVE' },
      data: { status: 'VACATED', endDate: input.startDate },
    });

    return tx.studentMessPlan.create({
      data: {
        studentId: input.studentId,
        messPlanId: input.messPlanId,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        status: 'ACTIVE',
      },
      include: {
        messPlan: { include: { hostel: { select: { name: true } } } },
        student: {
          select: {
            id: true,
            admissionNumber: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  });
}

// ------------------------------------------------------------------ Complaints

const complaintInclude = {
  hostel: { select: { id: true, name: true } },
  room: { select: { id: true, roomNumber: true } },
  student: {
    select: {
      id: true,
      admissionNumber: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.HostelComplaintInclude;

export async function createComplaint(input: CreateComplaintInput, user: AuthenticatedUser) {
  // A student raising their own complaint does not need to name themselves.
  const studentId = input.studentId ?? user.studentId;

  if (!studentId) {
    throw new BadRequestError('Select the student this complaint relates to', [
      { field: 'studentId', message: 'Student is required' },
    ]);
  }

  return prisma.hostelComplaint.create({
    data: {
      hostelId: input.hostelId,
      roomId: input.roomId ?? null,
      studentId,
      category: input.category,
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: 'OPEN',
    },
    include: complaintInclude,
  });
}

export async function updateComplaint(
  id: string,
  input: {
    status?: Prisma.HostelComplaintWhereInput['status'];
    priority?: Prisma.HostelComplaintWhereInput['priority'];
    assignedToId?: string | null;
    resolution?: string;
  },
) {
  const existing = await prisma.hostelComplaint.findUnique({
    where: { id },
    select: { status: true },
  });

  if (!existing) throw new NotFoundError('Complaint');

  const isClosing = input.status === 'RESOLVED' || input.status === 'CLOSED';

  return prisma.hostelComplaint.update({
    where: { id },
    data: {
      ...(input.status !== undefined ? { status: input.status as never } : {}),
      ...(input.priority !== undefined ? { priority: input.priority as never } : {}),
      ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
      ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
      // Stamp the resolution time exactly once, when it first closes.
      ...(isClosing && existing.status !== 'RESOLVED' && existing.status !== 'CLOSED'
        ? { resolvedAt: new Date() }
        : {}),
    },
    include: complaintInclude,
  });
}

export async function listComplaints(
  user: AuthenticatedUser,
  query: ListQueryOptions,
  filters: {
    hostelId?: string;
    studentId?: string;
    category?: Prisma.HostelComplaintWhereInput['category'];
    status?: string[];
    priority?: Prisma.HostelComplaintWhereInput['priority'];
  },
) {
  const where: Prisma.HostelComplaintWhereInput = {
    // Students see only their own complaints.
    ...(user.role === 'STUDENT' ? { studentId: user.studentId ?? '__none__' } : {}),
    ...(filters.hostelId ? { hostelId: filters.hostelId } : {}),
    ...(filters.studentId ? { studentId: filters.studentId } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.status?.length ? { status: { in: filters.status as never } } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.hostelComplaint.findMany({
      where,
      include: complaintInclude,
      // Urgent items first, then newest.
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      skip: query.skip,
      take: query.take,
    }),
    prisma.hostelComplaint.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

/** Occupancy and complaint counters for the hostel dashboard. */
export async function getHostelStats() {
  const [rooms, allocations, complaints, visitorsInside, pendingTransfers] = await Promise.all([
    prisma.hostelRoom.aggregate({
      where: { deletedAt: null },
      _sum: { capacity: true, occupied: true },
      _count: { _all: true },
    }),
    prisma.hostelAllocation.count({ where: { status: 'ACTIVE' } }),
    prisma.hostelComplaint.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.hostelVisitor.count({ where: { checkOutAt: null } }),
    prisma.roomTransfer.count({ where: { status: 'PENDING' } }),
  ]);

  const capacity = rooms._sum.capacity ?? 0;
  const occupied = rooms._sum.occupied ?? 0;

  const complaintCounts = complaints.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.status] = row._count._all;
    return accumulator;
  }, {});

  return {
    roomCount: rooms._count._all,
    capacity,
    occupied,
    vacant: Math.max(0, capacity - occupied),
    occupancyPercent: capacity === 0 ? null : Number(((occupied / capacity) * 100).toFixed(1)),
    residents: allocations,
    openComplaints: (complaintCounts['OPEN'] ?? 0) + (complaintCounts['IN_PROGRESS'] ?? 0),
    resolvedComplaints: complaintCounts['RESOLVED'] ?? 0,
    visitorsInside,
    pendingTransfers,
  };
}

/** Flat rows for the hostel occupancy report. */
export async function getHostelReportRows(hostelId?: string) {
  const allocations = await prisma.hostelAllocation.findMany({
    where: {
      status: 'ACTIVE',
      ...(hostelId ? { room: { hostelId } } : {}),
    },
    include: allocationInclude,
    orderBy: [{ room: { roomNumber: 'asc' } }],
  });

  return allocations.map((allocation) => ({
    Hostel: allocation.room.hostel.name,
    Room: allocation.room.roomNumber,
    Floor: allocation.room.floor ?? '',
    'Room Type': allocation.room.type,
    Bed: allocation.bedNumber ?? '',
    'Admission Number': allocation.student.admissionNumber,
    Student: `${allocation.student.user.firstName} ${allocation.student.user.lastName}`,
    Class: allocation.student.class?.name ?? '',
    Section: allocation.student.section?.name ?? '',
    Phone: allocation.student.user.phone ?? '',
    'Allocated From': allocation.allocatedFrom.toISOString().slice(0, 10),
    'Monthly Rent': Number(allocation.room.monthlyRent),
  }));
}
