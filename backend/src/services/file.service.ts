import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FileCategory, type FileAsset } from '@prisma/client';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { prisma } from '@/config/prisma';
import type { AuthenticatedUser } from '@/types/auth';
import { BadRequestError, NotFoundError } from '@/utils/api-error';

/** Sub-directory per category, mirroring the PRD's `uploads/` layout. */
const CATEGORY_DIRECTORY: Record<FileCategory, string> = {
  STUDENTS: 'students',
  TEACHERS: 'teachers',
  DOCUMENTS: 'documents',
  ASSIGNMENTS: 'assignments',
  REPORT_CARDS: 'report-cards',
  NOTICES: 'notices',
  MESSAGES: 'messages',
  LIBRARY: 'library',
  INSTITUTION: 'institution',
  MISC: 'misc',
};

export function categoryDirectory(category: FileCategory): string {
  return path.join(env.uploadRoot, CATEGORY_DIRECTORY[category]);
}

/** Creates every category directory. Called once at boot. */
export async function ensureUploadDirectories(): Promise<void> {
  await Promise.all(
    Object.values(FileCategory).map((category) =>
      fs.mkdir(categoryDirectory(category), { recursive: true }),
    ),
  );
}

/**
 * Resolves a stored file to an absolute path, refusing anything that escapes
 * the upload root — defence in depth against path traversal in stored names.
 */
export function resolveStoredPath(relativePath: string): string {
  const absolute = path.resolve(env.uploadRoot, relativePath);
  const root = path.resolve(env.uploadRoot);

  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new BadRequestError('Invalid file path');
  }

  return absolute;
}

async function checksum(absolutePath: string): Promise<string> {
  const buffer = await fs.readFile(absolutePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export interface PersistFileInput {
  file: Express.Multer.File;
  category: FileCategory;
  uploadedById: string | null;
}

/** Registers an already-written multer file as a `FileAsset` row. */
export async function persistFileAsset({
  file,
  category,
  uploadedById,
}: PersistFileInput): Promise<FileAsset> {
  const relativePath = path
    .relative(env.uploadRoot, file.path)
    .split(path.sep)
    .join('/');

  return prisma.fileAsset.create({
    data: {
      originalName: file.originalname,
      storedName: file.filename,
      relativePath,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      category,
      checksum: await checksum(file.path),
      uploadedById,
    },
  });
}

/** Removes the row and its bytes. Missing bytes are tolerated. */
export async function deleteFileAsset(fileId: string): Promise<void> {
  const asset = await prisma.fileAsset.findUnique({ where: { id: fileId } });
  if (!asset) return;

  await prisma.fileAsset.delete({ where: { id: fileId } });

  try {
    await fs.unlink(resolveStoredPath(asset.relativePath));
  } catch (error) {
    logger.warn('Stored file could not be removed from disk', {
      fileId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Deletes files that were written to disk before a transaction failed. */
export async function discardUploadedFiles(files: Express.Multer.File[]): Promise<void> {
  await Promise.all(
    files.map(async (file) => {
      try {
        await fs.unlink(file.path);
      } catch {
        // Nothing to clean up.
      }
    }),
  );
}

/** Roles that may read any stored file. */
const FILE_ADMIN_ROLES = new Set<AuthenticatedUser['role']>([
  'SUPER_ADMIN',
  'ADMIN',
]);

/** Categories whose contents are institution-wide and readable by any signed-in user. */
const PUBLIC_CATEGORIES = new Set<FileCategory>([
  FileCategory.NOTICES,
  FileCategory.LIBRARY,
  FileCategory.INSTITUTION,
]);

/**
 * Decides whether `user` may read `asset`.
 *
 * Ownership is resolved through the tables that reference the file, so a
 * parent can read their child's report card while another parent cannot.
 */
export async function canAccessFile(
  asset: FileAsset,
  user: AuthenticatedUser,
): Promise<boolean> {
  if (FILE_ADMIN_ROLES.has(user.role)) return true;
  if (asset.uploadedById === user.id) return true;
  if (PUBLIC_CATEGORIES.has(asset.category)) return true;

  // Staff need read access to the academic artefacts they work with.
  if (user.role === 'TEACHER' || user.role === 'LIBRARIAN' || user.role === 'ACCOUNTANT') {
    return true;
  }

  // Students and parents may only read files tied to their own record.
  const studentIds = await resolveVisibleStudentIds(user);
  if (studentIds.length === 0) return false;

  const [documentMatch, reportCardMatch, submissionMatch, photoMatch] = await Promise.all([
    prisma.document.count({
      where: { fileId: asset.id, studentId: { in: studentIds }, deletedAt: null },
    }),
    prisma.reportCard.count({ where: { fileId: asset.id, studentId: { in: studentIds } } }),
    prisma.submissionAttachment.count({
      where: { fileId: asset.id, submission: { studentId: { in: studentIds } } },
    }),
    prisma.student.count({ where: { id: { in: studentIds }, photoId: asset.id } }),
  ]);

  if (documentMatch + reportCardMatch + submissionMatch + photoMatch > 0) return true;

  // Assignment attachments are readable by the classes they are published to.
  const assignmentMatch = await prisma.assignmentAttachment.count({
    where: {
      fileId: asset.id,
      assignment: {
        status: { in: ['PUBLISHED', 'CLOSED'] },
        submissions: { some: { studentId: { in: studentIds } } },
      },
    },
  });

  return assignmentMatch > 0;
}

/** The students whose files a given user is entitled to see. */
async function resolveVisibleStudentIds(user: AuthenticatedUser): Promise<string[]> {
  if (user.studentId) return [user.studentId];

  if (user.guardianId) {
    const links = await prisma.studentGuardian.findMany({
      where: { guardianId: user.guardianId },
      select: { studentId: true },
    });
    return links.map((link) => link.studentId);
  }

  return [];
}

export async function getFileAssetOrThrow(fileId: string): Promise<FileAsset> {
  const asset = await prisma.fileAsset.findUnique({ where: { id: fileId } });
  if (!asset) {
    throw new NotFoundError('File');
  }
  return asset;
}
