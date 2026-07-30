import { Prisma, type EmployeeStatus } from '@prisma/client';
import { env } from '@/config/env';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildOrderBy, buildPaginationMeta } from '@/utils/pagination';
import { generateTemporaryPassword, hashPassword } from '@/utils/password';
import { nextSequentialCode, withUniqueRetry } from '@/utils/sequence';
import { renderStoredTemplate, sendEmail } from './email.service';
import type {
  CreateTeacherInput,
  SalaryInput,
  UpdateTeacherInput,
} from '@/validators/teacher.validator';

export const TEACHER_SORT_FIELDS = [
  'employeeId',
  'designation',
  'experienceYears',
  'joiningDate',
  'status',
  'createdAt',
  'user.firstName',
  'user.lastName',
] as const;

const teacherListSelect = {
  id: true,
  employeeId: true,
  designation: true,
  qualification: true,
  specialization: true,
  experienceYears: true,
  joiningDate: true,
  employmentType: true,
  status: true,
  gender: true,
  photoId: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true } },
  department: { select: { id: true, name: true, code: true } },
  subjects: { select: { subject: { select: { id: true, name: true, code: true } } } },
  _count: { select: { classSubjects: true, classTeacherOf: true, sectionTeacherOf: true } },
} satisfies Prisma.TeacherSelect;

export type TeacherListItem = Prisma.TeacherGetPayload<{ select: typeof teacherListSelect }>;

export interface TeacherFilters {
  departmentId?: string;
  subjectId?: string;
  status?: EmployeeStatus[];
  employmentType?: Prisma.TeacherWhereInput['employmentType'];
  gender?: Prisma.TeacherWhereInput['gender'];
  includeArchived?: boolean;
}

function buildTeacherWhere(
  query: Pick<ListQueryOptions, 'search'>,
  filters: TeacherFilters,
): Prisma.TeacherWhereInput {
  return {
    ...(filters.includeArchived ? {} : { deletedAt: null }),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.subjectId ? { subjects: { some: { subjectId: filters.subjectId } } } : {}),
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(filters.employmentType ? { employmentType: filters.employmentType } : {}),
    ...(filters.gender ? { gender: filters.gender } : {}),
    ...(query.search
      ? {
          OR: [
            { employeeId: { contains: query.search, mode: 'insensitive' } },
            { designation: { contains: query.search, mode: 'insensitive' } },
            { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
            { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
            { user: { email: { contains: query.search, mode: 'insensitive' } } },
            { user: { phone: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}

export async function listTeachers(
  query: ListQueryOptions,
  filters: TeacherFilters,
): Promise<PaginatedData<TeacherListItem>> {
  const where = buildTeacherWhere(query, filters);

  const [items, totalItems] = await Promise.all([
    prisma.teacher.findMany({
      where,
      select: teacherListSelect,
      orderBy: buildOrderBy(query.sortBy ?? 'employeeId', query.sortOrder),
      skip: query.skip,
      take: query.take,
    }),
    prisma.teacher.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

const teacherDetailInclude = {
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
  department: { select: { id: true, name: true, code: true } },
  address: true,
  photo: { select: { id: true, originalName: true, mimeType: true } },
  subjects: { include: { subject: true } },
  salaries: { orderBy: { effectiveFrom: 'desc' } },
  classTeacherOf: {
    where: { deletedAt: null },
    select: { id: true, name: true, code: true, academicYear: { select: { name: true } } },
  },
  sectionTeacherOf: {
    where: { deletedAt: null },
    select: { id: true, name: true, class: { select: { id: true, name: true } } },
  },
  classSubjects: {
    include: {
      subject: { select: { id: true, name: true, code: true } },
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      semester: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.TeacherInclude;

export type TeacherDetail = Prisma.TeacherGetPayload<{ include: typeof teacherDetailInclude }>;

export async function getTeacher(id: string): Promise<TeacherDetail> {
  const teacher = await prisma.teacher.findFirst({
    where: { id, deletedAt: null },
    include: teacherDetailInclude,
  });

  if (!teacher) throw new NotFoundError('Teacher');
  return teacher;
}

async function generateEmployeeId(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const prefix = 'EMP';
  const latest = await tx.teacher.findFirst({
    where: { employeeId: { startsWith: `${prefix}/${year}/` } },
    orderBy: { employeeId: 'desc' },
    select: { employeeId: true },
  });

  return nextSequentialCode({ prefix, year, currentMax: latest?.employeeId ?? null });
}

export async function createTeacher(input: CreateTeacherInput): Promise<{
  teacher: TeacherDetail;
  temporaryPassword: string | null;
}> {
  let temporaryPassword: string | null = null;
  let accountEmail: string | null = null;
  let accountName = '';

  const teacher = await withUniqueRetry(
    () =>
      prisma.$transaction(async (tx) => {
        const joiningYear = input.joiningDate.getUTCFullYear();
        const employeeId = input.employeeId ?? (await generateEmployeeId(tx, joiningYear));

        const password = generateTemporaryPassword();
        const user = await tx.user.create({
          data: {
            email: input.email,
            phone: input.phone,
            firstName: input.firstName,
            lastName: input.lastName,
            role: 'TEACHER',
            status: input.createPortalAccount ? 'ACTIVE' : 'INACTIVE',
            passwordHash: await hashPassword(password),
            mustChangePassword: true,
          },
        });

        if (input.createPortalAccount) {
          temporaryPassword = password;
          accountEmail = user.email;
          accountName = user.firstName;
        }

        const address = input.address
          ? await tx.address.create({
              data: {
                type: input.address.type,
                line1: input.address.line1,
                line2: input.address.line2 ?? null,
                landmark: input.address.landmark ?? null,
                city: input.address.city,
                state: input.address.state,
                country: input.address.country,
                postalCode: input.address.postalCode,
              },
            })
          : null;

        const created = await tx.teacher.create({
          data: {
            userId: user.id,
            employeeId,
            departmentId: input.departmentId ?? null,
            designation: input.designation,
            qualification: input.qualification,
            specialization: input.specialization ?? null,
            experienceYears: input.experienceYears,
            joiningDate: input.joiningDate,
            employmentType: input.employmentType,
            gender: input.gender,
            dateOfBirth: input.dateOfBirth ?? null,
            bloodGroup: input.bloodGroup ?? null,
            addressId: address?.id ?? null,
            status: 'ACTIVE',
          },
        });

        if (input.subjectIds.length > 0) {
          await tx.teacherSubject.createMany({
            data: input.subjectIds.map((subjectId) => ({ teacherId: created.id, subjectId })),
            skipDuplicates: true,
          });
        }

        if (input.salary) {
          await tx.teacherSalary.create({
            data: {
              teacherId: created.id,
              basicSalary: input.salary.basicSalary,
              allowances: input.salary.allowances,
              deductions: input.salary.deductions,
              effectiveFrom: input.salary.effectiveFrom,
              effectiveTo: input.salary.effectiveTo ?? null,
              remarks: input.salary.remarks ?? null,
            },
          });
        }

        return tx.teacher.findUniqueOrThrow({
          where: { id: created.id },
          include: teacherDetailInclude,
        });
      }),
    'employeeId',
  );

  if (temporaryPassword && accountEmail) {
    const variables = {
      firstName: accountName,
      email: accountEmail,
      temporaryPassword,
      loginUrl: `${env.FRONTEND_URL}/login`,
      appName: 'EduCore',
    };

    const template = await renderStoredTemplate('account-created', variables);
    await sendEmail({
      to: accountEmail,
      subject: template?.subject ?? 'Your EduCore account is ready',
      html:
        template?.html ??
        `<p>Hello ${variables.firstName},</p>
         <p>Email: <strong>${variables.email}</strong><br/>
            Temporary password: <strong>${variables.temporaryPassword}</strong></p>
         <p><a href="${variables.loginUrl}">Sign in</a> and choose a new password.</p>`,
      ...(template ? { templateId: template.id } : {}),
    });
  }

  return { teacher, temporaryPassword };
}

export async function updateTeacher(id: string, input: UpdateTeacherInput): Promise<TeacherDetail> {
  const existing = await prisma.teacher.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, userId: true, addressId: true },
  });

  if (!existing) throw new NotFoundError('Teacher');

  return prisma.$transaction(async (tx) => {
    const userFields: Prisma.UserUpdateInput = {};
    if (input.firstName !== undefined) userFields.firstName = input.firstName;
    if (input.lastName !== undefined) userFields.lastName = input.lastName;
    if (input.email !== undefined) userFields.email = input.email;
    if (input.phone !== undefined) userFields.phone = input.phone;

    if (Object.keys(userFields).length > 0) {
      await tx.user.update({ where: { id: existing.userId }, data: userFields });
    }

    let addressId = existing.addressId;
    if (input.address) {
      const data = {
        type: input.address.type,
        line1: input.address.line1,
        line2: input.address.line2 ?? null,
        landmark: input.address.landmark ?? null,
        city: input.address.city,
        state: input.address.state,
        country: input.address.country,
        postalCode: input.address.postalCode,
      };
      addressId = addressId
        ? (await tx.address.update({ where: { id: addressId }, data })).id
        : (await tx.address.create({ data })).id;
    }

    await tx.teacher.update({
      where: { id },
      data: {
        departmentId: input.departmentId ?? undefined,
        designation: input.designation ?? undefined,
        qualification: input.qualification ?? undefined,
        specialization: input.specialization ?? undefined,
        experienceYears: input.experienceYears ?? undefined,
        joiningDate: input.joiningDate ?? undefined,
        employmentType: input.employmentType ?? undefined,
        status: input.status ?? undefined,
        gender: input.gender ?? undefined,
        dateOfBirth: input.dateOfBirth ?? undefined,
        bloodGroup: input.bloodGroup ?? undefined,
        addressId,
      },
    });

    return tx.teacher.findUniqueOrThrow({ where: { id }, include: teacherDetailInclude });
  });
}

/** Replaces the teacher's qualified-subject list. */
export async function assignSubjects(id: string, subjectIds: string[]): Promise<TeacherDetail> {
  await getTeacher(id);

  if (subjectIds.length > 0) {
    const found = await prisma.subject.count({
      where: { id: { in: subjectIds }, deletedAt: null },
    });
    if (found !== subjectIds.length) throw new NotFoundError('One or more subjects');
  }

  await prisma.$transaction([
    prisma.teacherSubject.deleteMany({ where: { teacherId: id } }),
    prisma.teacherSubject.createMany({
      data: subjectIds.map((subjectId) => ({ teacherId: id, subjectId })),
      skipDuplicates: true,
    }),
  ]);

  return getTeacher(id);
}

/** Makes the teacher class teacher of a class and/or a section. */
export async function assignClass(
  id: string,
  { classId, sectionId }: { classId?: string | null; sectionId?: string | null },
): Promise<TeacherDetail> {
  await getTeacher(id);

  await prisma.$transaction(async (tx) => {
    if (classId) {
      const target = await tx.class.findFirst({
        where: { id: classId, deletedAt: null },
        select: { id: true },
      });
      if (!target) throw new NotFoundError('Class');
      await tx.class.update({ where: { id: classId }, data: { classTeacherId: id } });
    }

    if (sectionId) {
      const target = await tx.section.findFirst({
        where: { id: sectionId, deletedAt: null },
        select: { id: true },
      });
      if (!target) throw new NotFoundError('Section');
      await tx.section.update({ where: { id: sectionId }, data: { classTeacherId: id } });
    }
  });

  return getTeacher(id);
}

export async function addSalaryRecord(id: string, input: SalaryInput): Promise<TeacherDetail> {
  await getTeacher(id);

  await prisma.$transaction(async (tx) => {
    // Close the open-ended record so only one salary is effective at a time.
    await tx.teacherSalary.updateMany({
      where: { teacherId: id, effectiveTo: null },
      data: { effectiveTo: new Date(input.effectiveFrom.getTime() - 86_400_000) },
    });

    await tx.teacherSalary.create({
      data: {
        teacherId: id,
        basicSalary: input.basicSalary,
        allowances: input.allowances,
        deductions: input.deductions,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        remarks: input.remarks ?? null,
      },
    });
  });

  return getTeacher(id);
}

export async function changeTeacherStatus(
  id: string,
  status: EmployeeStatus,
): Promise<TeacherDetail> {
  const teacher = await prisma.teacher.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, userId: true },
  });

  if (!teacher) throw new NotFoundError('Teacher');

  const userStatus =
    status === 'ACTIVE' ? 'ACTIVE' : status === 'SUSPENDED' ? 'SUSPENDED' : 'INACTIVE';

  await prisma.$transaction(async (tx) => {
    await tx.teacher.update({ where: { id }, data: { status } });
    await tx.user.update({ where: { id: teacher.userId }, data: { status: userStatus } });

    if (userStatus !== 'ACTIVE') {
      await tx.refreshToken.updateMany({
        where: { userId: teacher.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  });

  return getTeacher(id);
}

/**
 * Soft delete. Refused while the teacher still owns teaching duties, so
 * classes are never left without an owner by accident.
 */
export async function deleteTeacher(id: string): Promise<void> {
  const teacher = await prisma.teacher.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      userId: true,
      _count: { select: { classTeacherOf: true, sectionTeacherOf: true, classSubjects: true } },
    },
  });

  if (!teacher) throw new NotFoundError('Teacher');

  const { classTeacherOf, sectionTeacherOf, classSubjects } = teacher._count;
  if (classTeacherOf + sectionTeacherOf + classSubjects > 0) {
    throw new ConflictError('Reassign this teacher’s classes and subjects before removing them.', [
      {
        field: 'id',
        message: `Still assigned to ${classTeacherOf} class(es), ${sectionTeacherOf} section(s) and ${classSubjects} subject offering(s)`,
      },
    ]);
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.teacher.update({ where: { id }, data: { deletedAt: now, status: 'RESIGNED' } }),
    prisma.user.update({ where: { id: teacher.userId }, data: { deletedAt: now, status: 'INACTIVE' } }),
    prisma.refreshToken.updateMany({
      where: { userId: teacher.userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
}

export async function updateTeacherPhoto(id: string, photoId: string): Promise<TeacherDetail> {
  await getTeacher(id);
  await prisma.teacher.update({ where: { id }, data: { photoId } });
  return getTeacher(id);
}

export async function listTeacherOptions(departmentId?: string) {
  return prisma.teacher.findMany({
    where: { deletedAt: null, status: 'ACTIVE', ...(departmentId ? { departmentId } : {}) },
    select: {
      id: true,
      employeeId: true,
      designation: true,
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: { user: { firstName: 'asc' } },
  });
}

export async function getTeachersForExport(filters: TeacherFilters) {
  const teachers = await prisma.teacher.findMany({
    where: buildTeacherWhere({}, filters),
    select: teacherListSelect,
    orderBy: { employeeId: 'asc' },
  });

  return teachers.map((teacher) => ({
    'Employee ID': teacher.employeeId,
    'First Name': teacher.user.firstName,
    'Last Name': teacher.user.lastName,
    Email: teacher.user.email,
    Phone: teacher.user.phone ?? '',
    Department: teacher.department?.name ?? '',
    Designation: teacher.designation,
    Qualification: teacher.qualification,
    Specialization: teacher.specialization ?? '',
    Subjects: teacher.subjects.map((link) => link.subject.name).join('; '),
    'Experience (years)': teacher.experienceYears,
    'Joining Date': teacher.joiningDate.toISOString().slice(0, 10),
    'Employment Type': teacher.employmentType,
    Gender: teacher.gender,
    Status: teacher.status,
  }));
}
