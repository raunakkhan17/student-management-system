import { Prisma, type DocumentType, type VerificationStatus } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import type { AuthenticatedUser } from '@/types/auth';
import { deleteFileAsset } from './file.service';
import { notify } from './notification.service';
import { ForbiddenError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';

/** Documents lapsing within this window are surfaced as warnings. */
const EXPIRY_WARNING_DAYS = 30;

const documentInclude = {
  file: {
    select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
  },
  student: {
    select: {
      id: true,
      admissionNumber: true,
      userId: true,
      user: { select: { firstName: true, lastName: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  },
  teacher: {
    select: {
      id: true,
      employeeId: true,
      userId: true,
      user: { select: { firstName: true, lastName: true } },
      department: { select: { name: true } },
    },
  },
  verifiedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.DocumentInclude;

export type DocumentRecord = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

/**
 * Restricts a query to what the caller may see.
 *
 * Students and parents only ever see their own paperwork; teachers see their
 * own; staff who can view the module see everything.
 */
async function visibilityScope(
  user: AuthenticatedUser,
  canViewAll: boolean,
): Promise<Prisma.DocumentWhereInput> {
  if (canViewAll) return {};

  if (user.studentId) return { studentId: user.studentId };
  if (user.teacherId) return { teacherId: user.teacherId };

  if (user.guardianId) {
    const links = await prisma.studentGuardian.findMany({
      where: { guardianId: user.guardianId },
      select: { studentId: true },
    });

    return { studentId: { in: links.map((link) => link.studentId) } };
  }

  // No profile means nothing to show, rather than everything.
  return { id: '__none__' };
}

export interface DocumentFilters {
  studentId?: string;
  teacherId?: string;
  type?: DocumentType;
  status?: VerificationStatus[];
  expiringSoon?: boolean;
}

export async function listDocuments(
  user: AuthenticatedUser,
  query: ListQueryOptions,
  filters: DocumentFilters,
  canViewAll: boolean,
): Promise<PaginatedData<DocumentRecord>> {
  const scope = await visibilityScope(user, canViewAll);
  const warningCutoff = new Date(Date.now() + EXPIRY_WARNING_DAYS * 86_400_000);

  const where: Prisma.DocumentWhereInput = {
    deletedAt: null,
    ...scope,
    ...(filters.studentId ? { studentId: filters.studentId } : {}),
    ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(filters.expiringSoon ? { expiryDate: { not: null, lte: warningCutoff } } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { file: { originalName: { contains: query.search, mode: 'insensitive' } } },
            { student: { admissionNumber: { contains: query.search, mode: 'insensitive' } } },
            { teacher: { employeeId: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.document.findMany({
      where,
      include: documentInclude,
      orderBy: { createdAt: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.document.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getDocument(
  id: string,
  user: AuthenticatedUser,
  canViewAll: boolean,
): Promise<DocumentRecord> {
  const scope = await visibilityScope(user, canViewAll);

  const document = await prisma.document.findFirst({
    where: { id, deletedAt: null, ...scope },
    include: documentInclude,
  });

  if (!document) throw new NotFoundError('Document');
  return document;
}

/**
 * Records an uploaded file against a student or a member of staff.
 *
 * The `FileAsset` is created first by the upload middleware; the `Document` row
 * is what makes it reachable, since `canAccessFile` resolves ownership through
 * it. A failure here must therefore discard the file, which the controller does.
 */
export async function createDocument(input: {
  fileId: string;
  type: DocumentType;
  title: string;
  studentId?: string | null;
  teacherId?: string | null;
  issuedDate?: Date;
  expiryDate?: Date;
  remarks?: string;
}): Promise<DocumentRecord> {
  if (input.studentId) {
    const student = await prisma.student.findFirst({
      where: { id: input.studentId, deletedAt: null },
      select: { id: true },
    });
    if (!student) throw new NotFoundError('Student');
  }

  if (input.teacherId) {
    const teacher = await prisma.teacher.findFirst({
      where: { id: input.teacherId, deletedAt: null },
      select: { id: true },
    });
    if (!teacher) throw new NotFoundError('Teacher');
  }

  return prisma.document.create({
    data: {
      fileId: input.fileId,
      type: input.type,
      title: input.title,
      studentId: input.studentId ?? null,
      teacherId: input.teacherId ?? null,
      issuedDate: input.issuedDate ?? null,
      expiryDate: input.expiryDate ?? null,
      remarks: input.remarks ?? null,
      status: 'PENDING',
    },
    include: documentInclude,
  });
}

export async function updateDocument(
  id: string,
  input: {
    type?: DocumentType;
    title?: string;
    issuedDate?: Date;
    expiryDate?: Date;
    remarks?: string;
  },
): Promise<DocumentRecord> {
  const existing = await prisma.document.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!existing) throw new NotFoundError('Document');

  return prisma.document.update({
    where: { id },
    data: {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.issuedDate !== undefined ? { issuedDate: input.issuedDate } : {}),
      ...(input.expiryDate !== undefined ? { expiryDate: input.expiryDate } : {}),
      ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
    },
    include: documentInclude,
  });
}

/** Approves or rejects a submitted document and tells the owner. */
export async function verifyDocument(
  id: string,
  input: { status: 'VERIFIED' | 'REJECTED'; remarks?: string },
  verifiedById: string,
): Promise<DocumentRecord> {
  const existing = await prisma.document.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!existing) throw new NotFoundError('Document');

  const document = await prisma.document.update({
    where: { id },
    data: {
      status: input.status,
      verifiedById,
      verifiedAt: new Date(),
      ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
    },
    include: documentInclude,
  });

  const ownerUserId = document.student?.userId ?? document.teacher?.userId ?? null;

  if (ownerUserId) {
    const decision = input.status === 'VERIFIED' ? 'verified' : 'rejected';
    const ownerFirstName =
      document.student?.user.firstName ?? document.teacher?.user.firstName ?? '';

    await notify({
      userIds: [ownerUserId],
      type: 'GENERAL',
      title: `Document ${decision}`,
      body: `"${document.title}" was ${decision}.`,
      link: '/documents',
      entityType: 'Document',
      entityId: document.id,
      emailTemplateKey: 'document-verified',
      emailVariables: {
        firstName: ownerFirstName,
        decision,
        documentTitle: document.title,
        remarks: input.remarks ?? '',
      },
    });
  }

  return document;
}

/**
 * Removes a document.
 *
 * The stored file goes with it — a document row is the only thing that makes an
 * uploaded file reachable, so leaving the file behind would orphan it on disk.
 */
export async function deleteDocument(id: string, user: AuthenticatedUser, canDelete: boolean): Promise<void> {
  const document = await prisma.document.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, fileId: true, studentId: true, teacherId: true, status: true },
  });

  if (!document) throw new NotFoundError('Document');

  const isOwner =
    (document.studentId !== null && document.studentId === user.studentId) ||
    (document.teacherId !== null && document.teacherId === user.teacherId);

  // An owner may withdraw their own submission until it has been verified.
  if (!canDelete && !(isOwner && document.status === 'PENDING')) {
    throw new ForbiddenError('You cannot remove this document');
  }

  await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
  await deleteFileAsset(document.fileId);
}

export interface ExpiringDocument {
  id: string;
  title: string;
  type: DocumentType;
  expiryDate: Date | null;
  ownerName: string;
  ownerIdentifier: string | null;
  daysRemaining: number;
}

/** Documents already lapsed or lapsing within the warning window. */
export async function listExpiringDocuments(
  user: AuthenticatedUser,
  canViewAll: boolean,
): Promise<ExpiringDocument[]> {
  const scope = await visibilityScope(user, canViewAll);
  const cutoff = new Date(Date.now() + EXPIRY_WARNING_DAYS * 86_400_000);

  const documents = await prisma.document.findMany({
    where: { deletedAt: null, ...scope, expiryDate: { not: null, lte: cutoff } },
    include: documentInclude,
    orderBy: { expiryDate: 'asc' },
    take: 100,
  });

  return documents.map((document) => {
    const owner = document.student ?? document.teacher;
    const expiry = document.expiryDate;

    return {
      id: document.id,
      title: document.title,
      type: document.type,
      expiryDate: expiry,
      ownerName: owner ? `${owner.user.firstName} ${owner.user.lastName}` : 'Unassigned',
      ownerIdentifier:
        document.student?.admissionNumber ?? document.teacher?.employeeId ?? null,
      daysRemaining: expiry
        ? Math.ceil((expiry.getTime() - Date.now()) / 86_400_000)
        : 0,
    };
  });
}

/** Counters for the documents header. */
export async function getDocumentStats(user: AuthenticatedUser, canViewAll: boolean) {
  const scope = await visibilityScope(user, canViewAll);
  const cutoff = new Date(Date.now() + EXPIRY_WARNING_DAYS * 86_400_000);
  const base: Prisma.DocumentWhereInput = { deletedAt: null, ...scope };

  const [total, pending, verified, rejected, expiring] = await Promise.all([
    prisma.document.count({ where: base }),
    prisma.document.count({ where: { ...base, status: 'PENDING' } }),
    prisma.document.count({ where: { ...base, status: 'VERIFIED' } }),
    prisma.document.count({ where: { ...base, status: 'REJECTED' } }),
    prisma.document.count({ where: { ...base, expiryDate: { not: null, lte: cutoff } } }),
  ]);

  return { total, pending, verified, rejected, expiring };
}
