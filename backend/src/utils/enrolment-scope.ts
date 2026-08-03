import { prisma } from '@/config/prisma';
import type { AuthenticatedUser } from '@/types/auth';

/**
 * Row-level scoping for the two roles that may only see their own enrolment.
 *
 * A student resolves to their own record; a parent resolves to every child
 * linked to their guardian profile. Both are used to constrain list queries so
 * a self-service account can never read another class's data.
 *
 * An empty array is a valid answer — it means "nothing", and callers pass it
 * straight into an `in` filter, which matches no rows.
 */

/** Student records this account is entitled to see. */
export async function ownStudentIds(user: AuthenticatedUser): Promise<string[]> {
  if (user.role === 'STUDENT') {
    return user.studentId ? [user.studentId] : [];
  }

  if (user.role === 'PARENT') {
    if (!user.guardianId) return [];
    const links = await prisma.studentGuardian.findMany({
      where: { guardianId: user.guardianId },
      select: { studentId: true },
    });
    return links.map((link) => link.studentId);
  }

  return [];
}

/** Sections those students belong to. */
export async function ownSectionIds(user: AuthenticatedUser): Promise<string[]> {
  const studentIds = await ownStudentIds(user);
  if (studentIds.length === 0) return [];

  const rows = await prisma.student.findMany({
    where: { id: { in: studentIds }, sectionId: { not: null } },
    select: { sectionId: true },
    distinct: ['sectionId'],
  });

  return rows.map((row) => row.sectionId as string);
}

/** Classes those students belong to. */
export async function ownClassIds(user: AuthenticatedUser): Promise<string[]> {
  const studentIds = await ownStudentIds(user);
  if (studentIds.length === 0) return [];

  const rows = await prisma.student.findMany({
    where: { id: { in: studentIds }, classId: { not: null } },
    select: { classId: true },
    distinct: ['classId'],
  });

  return rows.map((row) => row.classId as string);
}
