import type { Prisma, UserRole } from '@prisma/client';
import { prisma } from '@/config/prisma';
import { NotFoundError } from '@/utils/api-error';
import type { AttendanceRulesInput, InstitutionInput } from '@/validators/settings.validator';

/**
 * Module 19 — Settings.
 *
 * Four of the PRD's eight items are owned by the modules that use them
 * (academic session, grade system, fee configuration, notification settings)
 * and are reached through their own endpoints. This service covers the rest.
 */

const institutionInclude = {
  address: true,
  logo: { select: { id: true, originalName: true, mimeType: true } },
} satisfies Prisma.InstitutionInclude;

/** The single institution row. Created on first save if the seed never ran. */
export async function getInstitution() {
  return prisma.institution.findFirst({ include: institutionInclude });
}

export async function saveInstitution(input: InstitutionInput) {
  const existing = await prisma.institution.findFirst({ select: { id: true, addressId: true } });

  const { address, ...profile } = input;

  return prisma.$transaction(async (tx) => {
    // The address is a separate row, so it is upserted alongside the profile
    // rather than nested — an institution may not have had one before.
    let addressId = existing?.addressId ?? null;

    if (address) {
      if (addressId) {
        await tx.address.update({ where: { id: addressId }, data: address });
      } else {
        const created = await tx.address.create({ data: { ...address, type: 'OFFICE' } });
        addressId = created.id;
      }
    }

    if (!existing) {
      return tx.institution.create({
        data: { ...profile, addressId },
        include: institutionInclude,
      });
    }

    return tx.institution.update({
      where: { id: existing.id },
      data: { ...profile, addressId },
      include: institutionInclude,
    });
  });
}

/**
 * Attendance rules are per academic year. Callers that omit the year get the
 * current one, which is what the settings screen always wants.
 */
export async function getAttendanceRules(academicYearId?: string) {
  const year = academicYearId
    ? await prisma.academicYear.findUnique({
        where: { id: academicYearId },
        select: { id: true, name: true },
      })
    : await prisma.academicYear.findFirst({
        where: { isCurrent: true },
        select: { id: true, name: true },
      });

  if (!year) throw new NotFoundError('Academic year');

  // Seeded alongside the year, but tolerate a missing row rather than 404.
  const rules = await prisma.attendanceRule.upsert({
    where: { academicYearId: year.id },
    update: {},
    create: { academicYearId: year.id },
  });

  return { ...rules, academicYear: year };
}

export async function saveAttendanceRules(input: AttendanceRulesInput) {
  const { academicYearId, ...values } = input;

  const year = academicYearId
    ? await prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { id: true } })
    : await prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });

  if (!year) throw new NotFoundError('Academic year');

  return prisma.attendanceRule.upsert({
    where: { academicYearId: year.id },
    update: values,
    create: { ...values, academicYearId: year.id },
  });
}

/**
 * Email templates, read-only.
 *
 * Editing them safely needs variable validation and a preview, which is out of
 * scope; the bodies are seeded and changed in code. Listing them still matters
 * so an administrator can see what the system sends and with which variables.
 */
export async function listEmailTemplates() {
  return prisma.emailTemplate.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      key: true,
      name: true,
      subject: true,
      description: true,
      variables: true,
      isActive: true,
      updatedAt: true,
    },
  });
}

/**
 * The role/module/action grant matrix, read-only.
 *
 * Editing it from the UI is deliberately not offered: a caller can revoke their
 * own `SETTINGS:EDIT` and lock every administrator out, so changes go through
 * the seed where they are reviewable.
 */
export async function getPermissionMatrix() {
  const rows = await prisma.rolePermission.findMany({
    orderBy: [{ role: 'asc' }, { module: 'asc' }, { action: 'asc' }],
    select: { role: true, module: true, action: true, allowed: true },
  });

  const matrix: Record<string, Record<string, string[]>> = {};

  for (const row of rows) {
    if (!row.allowed) continue;
    const role = (matrix[row.role] ??= {});
    (role[row.module] ??= []).push(row.action);
  }

  return {
    roles: [...new Set(rows.map((row) => row.role))] as UserRole[],
    matrix,
    totalGrants: rows.filter((row) => row.allowed).length,
  };
}
