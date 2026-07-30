import crypto from 'node:crypto';
import path from 'node:path';
import type { FileCategory } from '@prisma/client';
import type { Request } from 'express';
import multer, { type FileFilterCallback, type Multer } from 'multer';
import { env } from '@/config/env';
import { categoryDirectory } from '@/services/file.service';
import { BadRequestError } from '@/utils/api-error';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
] as const;

export const IMAGE_MIME_TYPES: readonly string[] = IMAGE_TYPES;
export const DOCUMENT_MIME_TYPES: readonly string[] = [...IMAGE_TYPES, ...DOCUMENT_TYPES];

/** Extensions that must never be accepted regardless of the declared MIME type. */
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.com', '.msi', '.scr', '.ps1',
  '.sh', '.js', '.mjs', '.cjs', '.jar', '.php', '.py', '.rb', '.html', '.htm', '.svg',
]);

export interface UploaderOptions {
  category: FileCategory;
  allowedMimeTypes?: readonly string[];
  maxSizeBytes?: number;
}

/**
 * Builds a multer instance that writes into the category folder under
 * `uploads/` with a random, extension-preserving filename. Client-supplied
 * names are never used on disk.
 */
export function createUploader({
  category,
  allowedMimeTypes = DOCUMENT_MIME_TYPES,
  maxSizeBytes = env.maxUploadBytes,
}: UploaderOptions): Multer {
  const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, categoryDirectory(category));
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
    },
  });

  const fileFilter = (_req: Request, file: Express.Multer.File, callback: FileFilterCallback): void => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (BLOCKED_EXTENSIONS.has(extension)) {
      callback(new BadRequestError(`Files of type ${extension} are not allowed`));
      return;
    }

    if (!allowedMimeTypes.includes(file.mimetype)) {
      callback(new BadRequestError(`Unsupported file type: ${file.mimetype}`));
      return;
    }

    callback(null, true);
  };

  return multer({ storage, fileFilter, limits: { fileSize: maxSizeBytes, files: 10 } });
}

/** Translates multer's own errors into the standard envelope. */
export function isMulterError(error: unknown): error is multer.MulterError {
  return error instanceof multer.MulterError;
}
