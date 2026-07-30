import { Prisma, type Student, type StudentStatus } from '@prisma/client';
import { env } from '@/config/env';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { BadRequestError, ConflictError, NotFoundError } from '@/utils/api-error';
import { buildOrderBy, buildPaginationMeta } from '@/utils/pagination';
import { generateTemporaryPassword, hashPassword } from '@/utils/password';
import { nextSequentialCode, withUniqueRetry } from '@/utils/sequence';
import { renderStoredTemplate, sendEmail } from './email.service';
import type {
  AddressInput,
  CreateStudentInput,
  GuardianInput,
  PromoteStudentsInput,
  TransferStudentInput,
  UpdateStudentInput,
} from '@/validators/student.validator';

export const STUDENT_SORT_FIELDS = [
  'admissionNumber',
  'rollNumber',
  'admissionDate',
  'dateOfBirth',
  'status',
  'createdAt',
  'user.firstName',
  'user.lastName',
] as const;

const studentListSelect = {
  id: true,
  admissionNumber: true,
  rollNumber: true,
  admissionDate: true,
  gender: true,
  dateOfBirth: true,
  bloodGroup: true,
  status: true,
  photoId: true,
  createdAt: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true } },
  class: { select: { id: true, name: true, code: true } },
  section: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true } },
  guardians: {
    where: { isPrimary: true },
    take: 1,
    select: {
      relation: true,
      guardian: { select: { id: true, firstName: true, lastName: true, phone: true } },
    },
  },
} satisfies Prisma.StudentSelect;

export type StudentListItem = Prisma.StudentGetPayload<{ select: typeof studentListSelect }>;

export interface StudentFilters {
  academicYearId?: string;
  classId?: string;
  sectionId?: string;
  gender?: Student['gender'];
  bloodGroup?: NonNullable<Student['bloodGroup']>;
  status?: StudentStatus[];
  admittedFrom?: Date;
  admittedTo?: Date;
  includeArchived?: boolean;
}

/** Restricts a query to the records a given caller is allowed to see. */
export interface StudentScope {
  /** Set for STUDENT callers — they may only read their own record. */
  studentId?: string | null;
  /** Set for PARENT callers — limited to their linked children. */
  guardianId?: string | null;
  /** Set for TEACHER callers — limited to the sections they teach. */
  teacherId?: string | null;
}

async function buildScopeFilter(scope: StudentScope): Promise<Prisma.StudentWhereInput> {
  if (scope.studentId) {
    return { id: scope.studentId };
  }

  if (scope.guardianId) {
    return { guardians: { some: { guardianId: scope.guardianId } } };
  }

  if (scope.teacherId) {
    // A teacher sees students in classes/sections they are attached to, either
    // as class teacher or through a subject offering.
    const offerings = await prisma.classSubject.findMany({
      where: { teacherId: scope.teacherId },
      select: { classId: true, sectionId: true },
    });

    const classIds = [...new Set(offerings.map((offering) => offering.classId))];
    const sectionIds = [
      ...new Set(offerings.map((offering) => offering.sectionId).filter((id): id is string => id !== null)),
    ];

    return {
      OR: [
        { class: { classTeacherId: scope.teacherId } },
        { section: { classTeacherId: scope.teacherId } },
        ...(classIds.length ? [{ classId: { in: classIds } }] : []),
        ...(sectionIds.length ? [{ sectionId: { in: sectionIds } }] : []),
      ],
    };
  }

  return {};
}

export async function buildStudentWhere(
  query: Pick<ListQueryOptions, 'search'>,
  filters: StudentFilters,
  scope: StudentScope,
): Promise<Prisma.StudentWhereInput> {
  const scopeFilter = await buildScopeFilter(scope);

  const statusFilter = filters.status?.length
    ? { status: { in: filters.status } }
    : filters.includeArchived
      ? {}
      : { status: { notIn: ['ARCHIVED'] as StudentStatus[] } };

  return {
    ...(filters.includeArchived ? {} : { deletedAt: null }),
    ...scopeFilter,
    ...statusFilter,
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    ...(filters.gender ? { gender: filters.gender } : {}),
    ...(filters.bloodGroup ? { bloodGroup: filters.bloodGroup } : {}),
    ...(filters.admittedFrom || filters.admittedTo
      ? {
          admissionDate: {
            ...(filters.admittedFrom ? { gte: filters.admittedFrom } : {}),
            ...(filters.admittedTo ? { lte: filters.admittedTo } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { admissionNumber: { contains: query.search, mode: 'insensitive' } },
            { rollNumber: { contains: query.search, mode: 'insensitive' } },
            { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
            { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
            { user: { email: { contains: query.search, mode: 'insensitive' } } },
            { user: { phone: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}

export async function listStudents(
  query: ListQueryOptions,
  filters: StudentFilters,
  scope: StudentScope,
): Promise<PaginatedData<StudentListItem>> {
  const where = await buildStudentWhere(query, filters, scope);

  const [items, totalItems] = await Promise.all([
    prisma.student.findMany({
      where,
      select: studentListSelect,
      orderBy: buildOrderBy(query.sortBy ?? 'admissionNumber', query.sortOrder),
      skip: query.skip,
      take: query.take,
    }),
    prisma.student.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

const studentDetailInclude = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      lastLoginAt: true,
    },
  },
  academicYear: { select: { id: true, name: true } },
  class: { select: { id: true, name: true, code: true } },
  section: { select: { id: true, name: true } },
  permanentAddress: true,
  currentAddress: true,
  photo: { select: { id: true, originalName: true, mimeType: true } },
  guardians: {
    include: { guardian: { include: { address: true } } },
    orderBy: { isPrimary: 'desc' },
  },
  electives: { include: { classSubject: { include: { subject: true } } } },
  _count: {
    select: {
      attendanceRecords: true,
      invoices: true,
      documents: true,
      submissions: true,
    },
  },
} satisfies Prisma.StudentInclude;

export type StudentDetail = Prisma.StudentGetPayload<{ include: typeof studentDetailInclude }>;

export async function getStudent(id: string, scope: StudentScope): Promise<StudentDetail> {
  const scopeFilter = await buildScopeFilter(scope);

  const student = await prisma.student.findFirst({
    where: { id, deletedAt: null, ...scopeFilter },
    include: studentDetailInclude,
  });

  if (!student) throw new NotFoundError('Student');
  return student;
}

/** Allocates the next admission number, e.g. `ADM/2026/0001`. */
async function generateAdmissionNumber(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const prefix = 'ADM';
  const latest = await tx.student.findFirst({
    where: { admissionNumber: { startsWith: `${prefix}/${year}/` } },
    orderBy: { admissionNumber: 'desc' },
    select: { admissionNumber: true },
  });

  return nextSequentialCode({ prefix, year, currentMax: latest?.admissionNumber ?? null });
}

function addressCreateData(input: AddressInput): Prisma.AddressCreateInput {
  return {
    type: input.type,
    line1: input.line1,
    line2: input.line2 ?? null,
    landmark: input.landmark ?? null,
    city: input.city,
    state: input.state,
    country: input.country,
    postalCode: input.postalCode,
  };
}

interface ProvisionedAccount {
  userId: string;
  email: string;
  firstName: string;
  temporaryPassword: string;
}

/**
 * Creates a student together with their login, addresses and guardians.
 *
 * The whole graph is written in one transaction: a partially created student
 * (say, with no guardian) would be worse than a failed request.
 */
export async function createStudent(input: CreateStudentInput): Promise<{
  student: StudentDetail;
  accounts: ProvisionedAccount[];
}> {
  const accounts: ProvisionedAccount[] = [];

  const student = await withUniqueRetry(
    () =>
      prisma.$transaction(async (tx) => {
        await assertPlacementIsValid(tx, input.classId ?? null, input.sectionId ?? null);

        const admissionYear = input.admissionDate.getUTCFullYear();
        const admissionNumber =
          input.admissionNumber ?? (await generateAdmissionNumber(tx, admissionYear));

        // --- Student login ---
        const temporaryPassword = generateTemporaryPassword();
        const user = await tx.user.create({
          data: {
            email: input.email,
            phone: input.phone ?? null,
            firstName: input.firstName,
            lastName: input.lastName,
            role: 'STUDENT',
            status: input.createPortalAccount ? 'ACTIVE' : 'INACTIVE',
            passwordHash: await hashPassword(temporaryPassword),
            mustChangePassword: true,
          },
        });

        if (input.createPortalAccount) {
          accounts.push({
            userId: user.id,
            email: user.email,
            firstName: user.firstName,
            temporaryPassword,
          });
        }

        // --- Addresses ---
        const permanentAddress = input.permanentAddress
          ? await tx.address.create({ data: addressCreateData(input.permanentAddress) })
          : null;

        const currentAddressInput = input.sameAsPermanent
          ? input.permanentAddress
          : input.currentAddress;

        const currentAddress = currentAddressInput
          ? await tx.address.create({
              data: { ...addressCreateData(currentAddressInput), type: 'CURRENT' },
            })
          : null;

        // --- Student ---
        const created = await tx.student.create({
          data: {
            userId: user.id,
            admissionNumber,
            rollNumber: input.rollNumber ?? null,
            admissionDate: input.admissionDate,
            academicYearId: input.academicYearId,
            classId: input.classId ?? null,
            sectionId: input.sectionId ?? null,
            gender: input.gender,
            dateOfBirth: input.dateOfBirth,
            bloodGroup: input.bloodGroup ?? null,
            aadhaarNumber: input.aadhaarNumber ?? null,
            nationality: input.nationality,
            religion: input.religion ?? null,
            category: input.category ?? null,
            motherTongue: input.motherTongue ?? null,
            previousSchool: input.previousSchool ?? null,
            emergencyContactName: input.emergencyContactName,
            emergencyContactPhone: input.emergencyContactPhone,
            emergencyContactRelation: input.emergencyContactRelation,
            permanentAddressId: permanentAddress?.id ?? null,
            currentAddressId: currentAddress?.id ?? null,
            status: 'ACTIVE',
          },
        });

        // --- Guardians ---
        for (const guardian of input.guardians) {
          const account = await linkGuardian(tx, created.id, guardian);
          if (account) accounts.push(account);
        }

        // --- Timeline ---
        await tx.studentTimelineEvent.create({
          data: {
            studentId: created.id,
            type: 'ADMISSION',
            title: 'Admitted to the institution',
            description: `Admission number ${admissionNumber}`,
            occurredAt: input.admissionDate,
          },
        });

        await tx.studentEnrollmentHistory.create({
          data: {
            studentId: created.id,
            type: 'ADMISSION',
            toClassId: input.classId ?? null,
            toSectionId: input.sectionId ?? null,
            toYearId: input.academicYearId,
            effectiveDate: input.admissionDate,
            remarks: 'Initial admission',
          },
        });

        return tx.student.findUniqueOrThrow({
          where: { id: created.id },
          include: studentDetailInclude,
        });
      }),
    'admissionNumber',
  );

  // Welcome emails are sent after the transaction commits, so a mail failure
  // can never roll back a successful admission.
  await Promise.all(accounts.map((account) => sendAccountEmail(account)));

  return { student, accounts };
}

/** Creates or reuses a guardian and links them to the student. */
async function linkGuardian(
  tx: Prisma.TransactionClient,
  studentId: string,
  input: GuardianInput,
): Promise<ProvisionedAccount | null> {
  let account: ProvisionedAccount | null = null;

  // Reuse an existing guardian when the same phone or Aadhaar is already known,
  // so siblings share one guardian record rather than duplicating it.
  const existing = await tx.guardian.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { phone: input.phone },
        ...(input.aadhaarNumber ? [{ aadhaarNumber: input.aadhaarNumber }] : []),
      ],
    },
  });

  let guardianId = existing?.id;

  if (!guardianId) {
    const address = input.address
      ? await tx.address.create({ data: addressCreateData(input.address) })
      : null;

    let userId: string | null = null;
    if (input.createPortalAccount && input.email) {
      const temporaryPassword = generateTemporaryPassword();
      const guardianUser = await tx.user.create({
        data: {
          email: input.email,
          phone: input.phone,
          firstName: input.firstName,
          lastName: input.lastName,
          role: 'PARENT',
          status: 'ACTIVE',
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
        },
      });
      userId = guardianUser.id;
      account = {
        userId,
        email: guardianUser.email,
        firstName: guardianUser.firstName,
        temporaryPassword,
      };
    }

    const guardian = await tx.guardian.create({
      data: {
        userId,
        firstName: input.firstName,
        lastName: input.lastName,
        relation: input.relation,
        occupation: input.occupation ?? null,
        organization: input.organization ?? null,
        phone: input.phone,
        alternatePhone: input.alternatePhone ?? null,
        email: input.email ?? null,
        annualIncome: input.annualIncome ?? null,
        aadhaarNumber: input.aadhaarNumber ?? null,
        qualification: input.qualification ?? null,
        addressId: address?.id ?? null,
      },
    });

    guardianId = guardian.id;
  }

  await tx.studentGuardian.upsert({
    where: { studentId_guardianId: { studentId, guardianId } },
    update: { relation: input.relation, isPrimary: input.isPrimary },
    create: { studentId, guardianId, relation: input.relation, isPrimary: input.isPrimary },
  });

  return account;
}

async function sendAccountEmail(account: ProvisionedAccount): Promise<void> {
  const variables = {
    firstName: account.firstName,
    email: account.email,
    temporaryPassword: account.temporaryPassword,
    loginUrl: `${env.FRONTEND_URL}/login`,
    appName: 'EduCore',
  };

  const template = await renderStoredTemplate('account-created', variables);

  await sendEmail({
    to: account.email,
    subject: template?.subject ?? 'Your EduCore account is ready',
    html:
      template?.html ??
      `<p>Hello ${variables.firstName},</p>
       <p>Your EduCore account has been created.</p>
       <p>Email: <strong>${variables.email}</strong><br/>
          Temporary password: <strong>${variables.temporaryPassword}</strong></p>
       <p><a href="${variables.loginUrl}">Sign in</a> and choose a new password.</p>`,
    ...(template ? { templateId: template.id } : {}),
  });
}

/** A section must belong to the chosen class, and must have room. */
async function assertPlacementIsValid(
  tx: Prisma.TransactionClient,
  classId: string | null,
  sectionId: string | null,
  excludeStudentId?: string,
): Promise<void> {
  if (!sectionId) return;

  const section = await tx.section.findFirst({
    where: { id: sectionId, deletedAt: null },
    select: { id: true, classId: true, name: true, capacity: true },
  });

  if (!section) throw new NotFoundError('Section');

  if (classId && section.classId !== classId) {
    throw new BadRequestError('That section does not belong to the selected class', [
      { field: 'sectionId', message: 'Section and class do not match' },
    ]);
  }

  const occupancy = await tx.student.count({
    where: {
      sectionId,
      deletedAt: null,
      status: { in: ['ACTIVE', 'SUSPENDED'] },
      ...(excludeStudentId ? { id: { not: excludeStudentId } } : {}),
    },
  });

  if (occupancy >= section.capacity) {
    throw new ConflictError(`Section ${section.name} is full (${section.capacity} seats).`, [
      { field: 'sectionId', message: 'No seats remaining in this section' },
    ]);
  }
}

export async function updateStudent(id: string, input: UpdateStudentInput): Promise<StudentDetail> {
  const existing = await prisma.student.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, userId: true, permanentAddressId: true, currentAddressId: true },
  });

  if (!existing) throw new NotFoundError('Student');

  return prisma.$transaction(async (tx) => {
    if (input.classId !== undefined || input.sectionId !== undefined) {
      await assertPlacementIsValid(tx, input.classId ?? null, input.sectionId ?? null, id);
    }

    const userFields: Prisma.UserUpdateInput = {};
    if (input.firstName !== undefined) userFields.firstName = input.firstName;
    if (input.lastName !== undefined) userFields.lastName = input.lastName;
    if (input.email !== undefined) userFields.email = input.email;
    if (input.phone !== undefined) userFields.phone = input.phone;

    if (Object.keys(userFields).length > 0) {
      await tx.user.update({ where: { id: existing.userId }, data: userFields });
    }

    // Addresses are replaced in place so historical records keep their own rows.
    let permanentAddressId = existing.permanentAddressId;
    if (input.permanentAddress) {
      const data = addressCreateData(input.permanentAddress);
      permanentAddressId = permanentAddressId
        ? (await tx.address.update({ where: { id: permanentAddressId }, data })).id
        : (await tx.address.create({ data })).id;
    }

    let currentAddressId = existing.currentAddressId;
    if (input.currentAddress) {
      const data = { ...addressCreateData(input.currentAddress), type: 'CURRENT' as const };
      currentAddressId = currentAddressId
        ? (await tx.address.update({ where: { id: currentAddressId }, data })).id
        : (await tx.address.create({ data })).id;
    }

    await tx.student.update({
      where: { id },
      data: {
        rollNumber: input.rollNumber ?? undefined,
        classId: input.classId ?? undefined,
        sectionId: input.sectionId ?? undefined,
        gender: input.gender ?? undefined,
        dateOfBirth: input.dateOfBirth ?? undefined,
        bloodGroup: input.bloodGroup ?? undefined,
        aadhaarNumber: input.aadhaarNumber ?? undefined,
        nationality: input.nationality ?? undefined,
        religion: input.religion ?? undefined,
        category: input.category ?? undefined,
        motherTongue: input.motherTongue ?? undefined,
        previousSchool: input.previousSchool ?? undefined,
        emergencyContactName: input.emergencyContactName ?? undefined,
        emergencyContactPhone: input.emergencyContactPhone ?? undefined,
        emergencyContactRelation: input.emergencyContactRelation ?? undefined,
        status: input.status ?? undefined,
        permanentAddressId,
        currentAddressId,
      },
    });

    return tx.student.findUniqueOrThrow({ where: { id }, include: studentDetailInclude });
  });
}

/** Moves one student to another class/section within the same academic year. */
export async function transferStudent(
  id: string,
  input: TransferStudentInput,
  performedById: string | null,
): Promise<StudentDetail> {
  const student = await prisma.student.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, classId: true, sectionId: true, academicYearId: true },
  });

  if (!student) throw new NotFoundError('Student');

  return prisma.$transaction(async (tx) => {
    await assertPlacementIsValid(tx, input.toClassId, input.toSectionId ?? null, id);

    await tx.student.update({
      where: { id },
      data: { classId: input.toClassId, sectionId: input.toSectionId ?? null },
    });

    await tx.studentEnrollmentHistory.create({
      data: {
        studentId: id,
        type: student.classId === input.toClassId ? 'SECTION_TRANSFER' : 'CLASS_TRANSFER',
        fromClassId: student.classId,
        toClassId: input.toClassId,
        fromSectionId: student.sectionId,
        toSectionId: input.toSectionId ?? null,
        fromYearId: student.academicYearId,
        toYearId: student.academicYearId,
        effectiveDate: input.effectiveDate,
        remarks: input.remarks ?? null,
        performedById,
      },
    });

    await tx.studentTimelineEvent.create({
      data: {
        studentId: id,
        type: 'TRANSFER',
        title: 'Transferred to a new class or section',
        description: input.remarks ?? null,
        occurredAt: input.effectiveDate,
        createdById: performedById,
      },
    });

    return tx.student.findUniqueOrThrow({ where: { id }, include: studentDetailInclude });
  });
}

/** Bulk promotion into the next academic year. */
export async function promoteStudents(
  input: PromoteStudentsInput,
  performedById: string | null,
): Promise<{ promoted: number; skipped: { studentId: string; reason: string }[] }> {
  const students = await prisma.student.findMany({
    where: { id: { in: input.studentIds }, deletedAt: null },
    select: { id: true, classId: true, sectionId: true, academicYearId: true, status: true },
  });

  const found = new Set(students.map((student) => student.id));
  const skipped: { studentId: string; reason: string }[] = input.studentIds
    .filter((studentId) => !found.has(studentId))
    .map((studentId) => ({ studentId, reason: 'Student not found' }));

  const eligible = students.filter((student) => {
    if (student.status !== 'ACTIVE') {
      skipped.push({ studentId: student.id, reason: `Status is ${student.status}` });
      return false;
    }
    return true;
  });

  if (eligible.length === 0) {
    return { promoted: 0, skipped };
  }

  // Capacity is checked once for the whole batch rather than per student.
  if (input.toSectionId) {
    const section = await prisma.section.findFirst({
      where: { id: input.toSectionId, deletedAt: null },
      select: { capacity: true, name: true, classId: true },
    });

    if (!section) throw new NotFoundError('Target section');
    if (section.classId !== input.toClassId) {
      throw new BadRequestError('The target section does not belong to the target class', [
        { field: 'toSectionId', message: 'Section and class do not match' },
      ]);
    }

    const existing = await prisma.student.count({
      where: { sectionId: input.toSectionId, deletedAt: null, status: 'ACTIVE' },
    });

    if (existing + eligible.length > section.capacity) {
      throw new ConflictError(
        `Section ${section.name} holds ${section.capacity}; promoting ${eligible.length} would exceed it.`,
        [{ field: 'toSectionId', message: `${section.capacity - existing} seat(s) remaining` }],
      );
    }
  }

  await prisma.$transaction([
    prisma.student.updateMany({
      where: { id: { in: eligible.map((student) => student.id) } },
      data: {
        academicYearId: input.toAcademicYearId,
        classId: input.toClassId,
        sectionId: input.toSectionId ?? null,
      },
    }),
    prisma.studentEnrollmentHistory.createMany({
      data: eligible.map((student) => ({
        studentId: student.id,
        type: 'PROMOTION' as const,
        fromClassId: student.classId,
        toClassId: input.toClassId,
        fromSectionId: student.sectionId,
        toSectionId: input.toSectionId ?? null,
        fromYearId: student.academicYearId,
        toYearId: input.toAcademicYearId,
        effectiveDate: input.effectiveDate,
        remarks: input.remarks ?? null,
        performedById,
      })),
    }),
    prisma.studentTimelineEvent.createMany({
      data: eligible.map((student) => ({
        studentId: student.id,
        type: 'PROMOTION' as const,
        title: 'Promoted to the next class',
        description: input.remarks ?? null,
        occurredAt: input.effectiveDate,
        createdById: performedById,
      })),
    }),
  ]);

  return { promoted: eligible.length, skipped };
}

/** Archive / deactivate / reinstate, keeping the login in step. */
export async function changeStudentStatus(
  id: string,
  status: StudentStatus,
  remarks: string | undefined,
  performedById: string | null,
): Promise<StudentDetail> {
  const student = await prisma.student.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, userId: true, status: true },
  });

  if (!student) throw new NotFoundError('Student');

  const userStatus =
    status === 'ACTIVE' ? 'ACTIVE' : status === 'SUSPENDED' ? 'SUSPENDED' : 'INACTIVE';

  return prisma.$transaction(async (tx) => {
    await tx.student.update({ where: { id }, data: { status } });
    await tx.user.update({ where: { id: student.userId }, data: { status: userStatus } });

    // Signing the account out immediately matters when access is being removed.
    if (userStatus !== 'ACTIVE') {
      await tx.refreshToken.updateMany({
        where: { userId: student.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await tx.studentTimelineEvent.create({
      data: {
        studentId: id,
        type: 'GENERAL',
        title: `Status changed from ${student.status} to ${status}`,
        description: remarks ?? null,
        occurredAt: new Date(),
        createdById: performedById,
      },
    });

    return tx.student.findUniqueOrThrow({ where: { id }, include: studentDetailInclude });
  });
}

/** Soft delete. Financial history is preserved, so outstanding dues block it. */
export async function deleteStudent(id: string): Promise<void> {
  const student = await prisma.student.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      userId: true,
      invoices: {
        where: { status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] }, deletedAt: null },
        select: { id: true },
      },
      _count: { select: { hostelAllocations: true } },
    },
  });

  if (!student) throw new NotFoundError('Student');

  if (student.invoices.length > 0) {
    throw new ConflictError('This student has unpaid invoices and cannot be deleted.', [
      { field: 'id', message: `${student.invoices.length} outstanding invoice(s)` },
    ]);
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.student.update({ where: { id }, data: { deletedAt: now, status: 'ARCHIVED' } }),
    prisma.user.update({ where: { id: student.userId }, data: { deletedAt: now, status: 'INACTIVE' } }),
    prisma.refreshToken.updateMany({
      where: { userId: student.userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
}

export async function getStudentTimeline(studentId: string, scope: StudentScope) {
  await getStudent(studentId, scope);

  const [events, enrollment] = await Promise.all([
    prisma.studentTimelineEvent.findMany({
      where: { studentId },
      orderBy: { occurredAt: 'desc' },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    }),
    prisma.studentEnrollmentHistory.findMany({
      where: { studentId },
      orderBy: { effectiveDate: 'desc' },
      include: {
        fromClass: { select: { name: true } },
        toClass: { select: { name: true } },
        fromSection: { select: { name: true } },
        toSection: { select: { name: true } },
      },
    }),
  ]);

  return { events, enrollment };
}

export async function addTimelineEvent(
  studentId: string,
  input: { type: Prisma.StudentTimelineEventCreateInput['type']; title: string; description?: string; occurredAt: Date },
  createdById: string | null,
) {
  await prisma.student.findFirstOrThrow({ where: { id: studentId, deletedAt: null } });

  return prisma.studentTimelineEvent.create({
    data: {
      studentId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      occurredAt: input.occurredAt,
      createdById,
    },
  });
}

export async function addGuardian(studentId: string, input: GuardianInput) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { id: true },
  });
  if (!student) throw new NotFoundError('Student');

  const account = await prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
    }
    return linkGuardian(tx, studentId, input);
  });

  if (account) await sendAccountEmail(account);

  return prisma.studentGuardian.findMany({
    where: { studentId },
    include: { guardian: { include: { address: true } } },
    orderBy: { isPrimary: 'desc' },
  });
}

export async function removeGuardian(studentId: string, guardianId: string): Promise<void> {
  const link = await prisma.studentGuardian.findUnique({
    where: { studentId_guardianId: { studentId, guardianId } },
  });

  if (!link) throw new NotFoundError('Guardian link');

  await prisma.studentGuardian.delete({
    where: { studentId_guardianId: { studentId, guardianId } },
  });
}

/** Points the student at a newly uploaded photo asset. */
export async function updateStudentPhoto(id: string, photoId: string): Promise<StudentDetail> {
  await prisma.student.findFirstOrThrow({ where: { id, deletedAt: null }, select: { id: true } });

  return prisma.student.update({
    where: { id },
    data: { photoId },
    include: studentDetailInclude,
  });
}

/** Everything printed on an ID card (PRD Module 3 — Generate ID Card). */
export async function getIdCardData(studentId: string, scope: StudentScope) {
  const student = await getStudent(studentId, scope);
  const institution = await prisma.institution.findFirst();

  return {
    institution: institution
      ? { name: institution.name, code: institution.code, logoId: institution.logoId, phone: institution.phone }
      : null,
    student: {
      id: student.id,
      fullName: `${student.user.firstName} ${student.user.lastName}`,
      admissionNumber: student.admissionNumber,
      rollNumber: student.rollNumber,
      className: student.class?.name ?? null,
      sectionName: student.section?.name ?? null,
      academicYear: student.academicYear.name,
      dateOfBirth: student.dateOfBirth,
      bloodGroup: student.bloodGroup,
      photoId: student.photoId,
      emergencyContactName: student.emergencyContactName,
      emergencyContactPhone: student.emergencyContactPhone,
      address: student.currentAddress ?? student.permanentAddress,
    },
  };
}

/** Flat rows for CSV/Excel export. */
export async function getStudentsForExport(filters: StudentFilters, scope: StudentScope) {
  const where = await buildStudentWhere({}, filters, scope);

  const students = await prisma.student.findMany({
    where,
    select: studentListSelect,
    orderBy: { admissionNumber: 'asc' },
  });

  return students.map((student) => ({
    'Admission Number': student.admissionNumber,
    'Roll Number': student.rollNumber ?? '',
    'First Name': student.user.firstName,
    'Last Name': student.user.lastName,
    Email: student.user.email,
    Phone: student.user.phone ?? '',
    Gender: student.gender,
    'Date of Birth': student.dateOfBirth.toISOString().slice(0, 10),
    'Blood Group': student.bloodGroup ?? '',
    Class: student.class?.name ?? '',
    Section: student.section?.name ?? '',
    'Academic Year': student.academicYear.name,
    'Admission Date': student.admissionDate.toISOString().slice(0, 10),
    Status: student.status,
    'Primary Guardian': student.guardians[0]
      ? `${student.guardians[0].guardian.firstName} ${student.guardians[0].guardian.lastName}`
      : '',
    'Guardian Phone': student.guardians[0]?.guardian.phone ?? '',
  }));
}
