import { Prisma, type ApplicantType, type LeaveType, type RequestStatus } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import type { AuthenticatedUser } from '@/types/auth';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';
import { notify } from './notification.service';

const leaveInclude = {
  applicant: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      studentProfile: {
        select: { admissionNumber: true, class: { select: { name: true } }, section: { select: { name: true } } },
      },
      teacherProfile: { select: { employeeId: true, department: { select: { name: true } } } },
    },
  },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
  attachment: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
} satisfies Prisma.LeaveRequestInclude;

export type LeaveRecord = Prisma.LeaveRequestGetPayload<{ include: typeof leaveInclude }>;

/** Inclusive whole-day span between two dates. */
function daysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((end - start) / 86_400_000) + 1;
}

/**
 * Maps a user's role onto the applicant type the schema records.
 *
 * Only students and teachers can hold leave; other staff roles are recorded as
 * TEACHER because they are employees for leave purposes.
 */
function applicantTypeFor(role: string): ApplicantType {
  return role === 'STUDENT' ? 'STUDENT' : 'TEACHER';
}

/** Who a caller may raise or read leave for. */
function canActFor(user: AuthenticatedUser, applicantId: string): boolean {
  return user.id === applicantId || user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
}

export async function applyForLeave(
  input: {
    applicantId?: string;
    type: LeaveType;
    fromDate: Date;
    toDate: Date;
    totalDays?: number;
    reason: string;
    attachmentId?: string | null;
  },
  user: AuthenticatedUser,
): Promise<LeaveRecord> {
  const applicantId = input.applicantId ?? user.id;

  if (!canActFor(user, applicantId)) {
    throw new ForbiddenError('You can only apply for your own leave');
  }

  const applicant = await prisma.user.findFirst({
    where: { id: applicantId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, role: true },
  });

  if (!applicant) throw new NotFoundError('Applicant');

  if (applicant.role === 'PARENT') {
    throw new BadRequestError('Parents do not hold leave; apply on behalf of the student instead', [
      { field: 'applicantId', message: 'Select a student or a member of staff' },
    ]);
  }

  const span = daysBetween(input.fromDate, input.toDate);
  const totalDays = input.totalDays ?? span;

  if (totalDays > span) {
    throw new BadRequestError('The number of days exceeds the selected date range', [
      { field: 'totalDays', message: `At most ${span} day(s) for this range` },
    ]);
  }

  // Overlapping requests would double-count the same absence.
  const overlapping = await prisma.leaveRequest.findFirst({
    where: {
      applicantId,
      status: { in: ['PENDING', 'APPROVED'] },
      fromDate: { lte: input.toDate },
      toDate: { gte: input.fromDate },
    },
    select: { id: true, fromDate: true, toDate: true },
  });

  if (overlapping) {
    throw new ConflictError('These dates overlap an existing leave request', [
      {
        field: 'fromDate',
        message: `Overlaps ${overlapping.fromDate.toISOString().slice(0, 10)} – ${overlapping.toDate
          .toISOString()
          .slice(0, 10)}`,
      },
    ]);
  }

  const request = await prisma.leaveRequest.create({
    data: {
      applicantId,
      applicantType: applicantTypeFor(applicant.role),
      type: input.type,
      fromDate: input.fromDate,
      toDate: input.toDate,
      totalDays: new Prisma.Decimal(totalDays),
      reason: input.reason,
      attachmentId: input.attachmentId ?? null,
      status: 'PENDING',
    },
    include: leaveInclude,
  });

  await notifyApprovers(request);

  return request;
}

/** Tells the people who can approve leave that a request is waiting. */
async function notifyApprovers(request: LeaveRecord): Promise<void> {
  const approvers = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      role: { in: ['SUPER_ADMIN', 'ADMIN'] },
      id: { not: request.applicantId },
    },
    select: { id: true },
  });

  if (approvers.length === 0) return;

  await notify({
    userIds: approvers.map((approver) => approver.id),
    type: 'GENERAL',
    title: 'Leave request awaiting approval',
    body: `${request.applicant.firstName} ${request.applicant.lastName} requested ${request.totalDays.toString()} day(s) of ${request.type.toLowerCase()} leave.`,
    link: '/leave',
    entityType: 'LeaveRequest',
    entityId: request.id,
  });
}

/**
 * Approves or rejects a request.
 *
 * The balance is only consumed on approval, inside the same transaction as the
 * status change, so a rejected request never eats an allowance and a double
 * approval cannot double-deduct.
 */
export async function reviewLeave(
  id: string,
  input: { status: 'APPROVED' | 'REJECTED'; reviewComment?: string },
  reviewedById: string,
): Promise<LeaveRecord> {
  const reviewed = await prisma.$transaction(async (tx) => {
    const request = await tx.leaveRequest.findUnique({
      where: { id },
      select: {
        id: true,
        applicantId: true,
        type: true,
        status: true,
        totalDays: true,
        fromDate: true,
      },
    });

    if (!request) throw new NotFoundError('Leave request');

    if (request.status !== 'PENDING') {
      throw new ConflictError(`This request has already been ${request.status.toLowerCase()}`);
    }

    if (request.applicantId === reviewedById) {
      throw new ForbiddenError('You cannot review your own leave request');
    }

    if (input.status === 'APPROVED') {
      await consumeBalance(tx, request.applicantId, request.type, request.totalDays, request.fromDate);
    }

    await tx.leaveRequest.update({
      where: { id },
      data: {
        status: input.status,
        reviewedById,
        reviewedAt: new Date(),
        reviewComment: input.reviewComment ?? null,
      },
    });

    return tx.leaveRequest.findUniqueOrThrow({ where: { id }, include: leaveInclude });
  });

  const decision = input.status === 'APPROVED' ? 'approved' : 'rejected';

  await notify({
    userIds: [reviewed.applicantId],
    type: input.status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    title: `Leave ${decision}`,
    body: `Your ${reviewed.type.toLowerCase()} leave request was ${decision}.`,
    link: '/leave',
    entityType: 'LeaveRequest',
    entityId: reviewed.id,
    emailTemplateKey: 'leave-decision',
    emailVariables: {
      firstName: reviewed.applicant.firstName,
      decision,
      leaveType: reviewed.type.toLowerCase(),
      fromDate: reviewed.fromDate.toISOString().slice(0, 10),
      toDate: reviewed.toDate.toISOString().slice(0, 10),
      totalDays: reviewed.totalDays.toString(),
      comment: input.reviewComment ?? '',
    },
  });

  return reviewed;
}

/**
 * Deducts approved days from the matching allowance.
 *
 * A missing balance row is not an error — institutions do not always cap every
 * leave type — but an existing row must not be overdrawn.
 */
async function consumeBalance(
  tx: Prisma.TransactionClient,
  userId: string,
  type: LeaveType,
  days: Prisma.Decimal,
  onDate: Date,
): Promise<void> {
  const year = await tx.academicYear.findFirst({
    where: { startDate: { lte: onDate }, endDate: { gte: onDate } },
    select: { id: true },
  });

  if (!year) return;

  const balance = await tx.leaveBalance.findUnique({
    where: { userId_academicYearId_type: { userId, academicYearId: year.id, type } },
    select: { id: true, allocated: true, used: true },
  });

  if (!balance) return;

  const remaining = balance.allocated.minus(balance.used);

  if (days.greaterThan(remaining)) {
    throw new ConflictError('This exceeds the applicant’s remaining allowance', [
      { field: 'status', message: `${remaining.toString()} day(s) remaining of ${type.toLowerCase()} leave` },
    ]);
  }

  await tx.leaveBalance.update({
    where: { id: balance.id },
    data: { used: balance.used.plus(days) },
  });
}

/** Withdraws a request. Approved leave is released back to the balance. */
export async function cancelLeave(id: string, user: AuthenticatedUser): Promise<LeaveRecord> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.leaveRequest.findUnique({
      where: { id },
      select: {
        id: true,
        applicantId: true,
        status: true,
        type: true,
        totalDays: true,
        fromDate: true,
      },
    });

    if (!request) throw new NotFoundError('Leave request');

    if (!canActFor(user, request.applicantId)) {
      throw new ForbiddenError('You can only cancel your own leave request');
    }

    if (request.status === 'CANCELLED' || request.status === 'REJECTED') {
      throw new ConflictError(`This request is already ${request.status.toLowerCase()}`);
    }

    if (request.status === 'APPROVED') {
      const year = await tx.academicYear.findFirst({
        where: { startDate: { lte: request.fromDate }, endDate: { gte: request.fromDate } },
        select: { id: true },
      });

      if (year) {
        const balance = await tx.leaveBalance.findUnique({
          where: {
            userId_academicYearId_type: {
              userId: request.applicantId,
              academicYearId: year.id,
              type: request.type,
            },
          },
          select: { id: true, used: true },
        });

        if (balance) {
          // Never let a release drive the counter below zero.
          const restored = balance.used.minus(request.totalDays);
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: { used: restored.isNegative() ? new Prisma.Decimal(0) : restored },
          });
        }
      }
    }

    await tx.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });

    return tx.leaveRequest.findUniqueOrThrow({ where: { id }, include: leaveInclude });
  });
}

export interface LeaveFilters {
  applicantId?: string;
  applicantType?: ApplicantType;
  type?: LeaveType;
  status?: RequestStatus[];
  from?: Date;
  to?: Date;
}

/** Builds the visibility scope: non-approvers only ever see their own leave. */
function scopeFor(user: AuthenticatedUser, filters: LeaveFilters): Prisma.LeaveRequestWhereInput {
  const isApprover = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  if (!isApprover) {
    return { applicantId: user.id };
  }

  return filters.applicantId ? { applicantId: filters.applicantId } : {};
}

export async function listLeaveRequests(
  user: AuthenticatedUser,
  query: ListQueryOptions,
  filters: LeaveFilters,
): Promise<PaginatedData<LeaveRecord>> {
  const where: Prisma.LeaveRequestWhereInput = {
    ...scopeFor(user, filters),
    ...(filters.applicantType ? { applicantType: filters.applicantType } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    // An overlap test, so a request spanning the window is included.
    ...(filters.to ? { fromDate: { lte: filters.to } } : {}),
    ...(filters.from ? { toDate: { gte: filters.from } } : {}),
    ...(query.search
      ? {
          OR: [
            { reason: { contains: query.search, mode: 'insensitive' } },
            { applicant: { firstName: { contains: query.search, mode: 'insensitive' } } },
            { applicant: { lastName: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: leaveInclude,
      // Pending first so approvers see their queue without changing the sort.
      orderBy: [{ status: 'asc' }, { fromDate: query.sortOrder }],
      skip: query.skip,
      take: query.take,
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getLeaveRequest(id: string, user: AuthenticatedUser): Promise<LeaveRecord> {
  const request = await prisma.leaveRequest.findUnique({ where: { id }, include: leaveInclude });

  if (!request) throw new NotFoundError('Leave request');

  if (!canActFor(user, request.applicantId) && user.role !== 'TEACHER') {
    throw new ForbiddenError('You do not have access to this leave request');
  }

  return request;
}

export interface CalendarEntry {
  id: string;
  applicantId: string;
  applicantName: string;
  applicantType: ApplicantType;
  identifier: string | null;
  type: LeaveType;
  status: RequestStatus;
  fromDate: Date;
  toDate: Date;
  totalDays: string;
}

/**
 * Approved and pending leave overlapping a date window, for the calendar view.
 *
 * Rejected and cancelled requests are excluded — the calendar answers "who is
 * away", not "who asked".
 */
export async function getLeaveCalendar(
  user: AuthenticatedUser,
  from: Date,
  to: Date,
  applicantType?: ApplicantType,
): Promise<CalendarEntry[]> {
  if (to < from) {
    throw new BadRequestError('The end date must not be before the start date', [
      { field: 'to', message: 'Choose a later date' },
    ]);
  }

  const isApprover = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const isStaff = isApprover || user.role === 'TEACHER';

  const requests = await prisma.leaveRequest.findMany({
    where: {
      status: { in: ['PENDING', 'APPROVED'] },
      fromDate: { lte: to },
      toDate: { gte: from },
      ...(applicantType ? { applicantType } : {}),
      // Students and parents see only their own entries on the calendar.
      ...(isStaff ? {} : { applicantId: user.id }),
    },
    include: leaveInclude,
    orderBy: { fromDate: 'asc' },
  });

  return requests.map((request) => ({
    id: request.id,
    applicantId: request.applicantId,
    applicantName: `${request.applicant.firstName} ${request.applicant.lastName}`,
    applicantType: request.applicantType,
    identifier:
      request.applicant.studentProfile?.admissionNumber ??
      request.applicant.teacherProfile?.employeeId ??
      null,
    type: request.type,
    status: request.status,
    fromDate: request.fromDate,
    toDate: request.toDate,
    totalDays: request.totalDays.toString(),
  }));
}

export interface BalanceRow {
  type: LeaveType;
  allocated: string;
  used: string;
  remaining: string;
}

export async function getLeaveBalances(
  user: AuthenticatedUser,
  filters: { userId?: string; academicYearId?: string },
): Promise<{ userId: string; academicYearId: string | null; balances: BalanceRow[] }> {
  const targetUserId = filters.userId ?? user.id;

  if (!canActFor(user, targetUserId)) {
    throw new ForbiddenError('You can only view your own leave balance');
  }

  const year = filters.academicYearId
    ? await prisma.academicYear.findUnique({
        where: { id: filters.academicYearId },
        select: { id: true },
      })
    : await prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });

  if (!year) {
    return { userId: targetUserId, academicYearId: null, balances: [] };
  }

  const balances = await prisma.leaveBalance.findMany({
    where: { userId: targetUserId, academicYearId: year.id },
    orderBy: { type: 'asc' },
  });

  return {
    userId: targetUserId,
    academicYearId: year.id,
    balances: balances.map((balance) => ({
      type: balance.type,
      allocated: balance.allocated.toString(),
      used: balance.used.toString(),
      remaining: balance.allocated.minus(balance.used).toString(),
    })),
  };
}

/**
 * Sets a user's allowances for a year.
 *
 * An allowance may not be cut below what has already been taken, otherwise the
 * remaining figure would go negative.
 */
export async function saveLeaveBalances(input: {
  userId: string;
  academicYearId: string;
  balances: { type: LeaveType; allocated: number }[];
}): Promise<BalanceRow[]> {
  const [user, year] = await Promise.all([
    prisma.user.findFirst({ where: { id: input.userId, deletedAt: null }, select: { id: true } }),
    prisma.academicYear.findUnique({ where: { id: input.academicYearId }, select: { id: true } }),
  ]);

  if (!user) throw new NotFoundError('User');
  if (!year) throw new NotFoundError('Academic year');

  await prisma.$transaction(async (tx) => {
    for (const balance of input.balances) {
      const existing = await tx.leaveBalance.findUnique({
        where: {
          userId_academicYearId_type: {
            userId: input.userId,
            academicYearId: input.academicYearId,
            type: balance.type,
          },
        },
        select: { id: true, used: true },
      });

      const allocated = new Prisma.Decimal(balance.allocated);

      if (existing && allocated.lessThan(existing.used)) {
        throw new ConflictError('An allowance cannot be below the days already taken', [
          {
            field: 'balances',
            message: `${balance.type.toLowerCase()}: ${existing.used.toString()} day(s) already used`,
          },
        ]);
      }

      if (existing) {
        await tx.leaveBalance.update({ where: { id: existing.id }, data: { allocated } });
      } else {
        await tx.leaveBalance.create({
          data: {
            userId: input.userId,
            academicYearId: input.academicYearId,
            type: balance.type,
            allocated,
          },
        });
      }
    }
  });

  const saved = await prisma.leaveBalance.findMany({
    where: { userId: input.userId, academicYearId: input.academicYearId },
    orderBy: { type: 'asc' },
  });

  return saved.map((balance) => ({
    type: balance.type,
    allocated: balance.allocated.toString(),
    used: balance.used.toString(),
    remaining: balance.allocated.minus(balance.used).toString(),
  }));
}

/** Counters for the leave dashboard. */
export async function getLeaveStats(user: AuthenticatedUser) {
  const isApprover = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const scope: Prisma.LeaveRequestWhereInput = isApprover ? {} : { applicantId: user.id };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [pending, approved, rejected, onLeaveToday] = await Promise.all([
    prisma.leaveRequest.count({ where: { ...scope, status: 'PENDING' } }),
    prisma.leaveRequest.count({ where: { ...scope, status: 'APPROVED' } }),
    prisma.leaveRequest.count({ where: { ...scope, status: 'REJECTED' } }),
    prisma.leaveRequest.count({
      where: { ...scope, status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: today } },
    }),
  ]);

  return { pending, approved, rejected, onLeaveToday };
}
