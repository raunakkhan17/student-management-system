import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import {
  canAccessFile,
  getFileAssetOrThrow,
  resolveStoredPath,
} from '@/services/file.service';
import { ForbiddenError, NotFoundError } from '@/utils/api-error';
import { asyncHandler } from '@/utils/async-handler';
import { sendSuccess } from '@/utils/api-response';

/** Streams a stored file after checking the caller is entitled to read it. */
export const downloadFile = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const fileId = req.params['id'] as string;

  const asset = await getFileAssetOrThrow(fileId);

  if (!(await canAccessFile(asset, user))) {
    throw new ForbiddenError('You do not have permission to access this file');
  }

  const absolutePath = resolveStoredPath(asset.relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new NotFoundError('File contents');
  }

  const disposition = req.query['download'] === 'true' ? 'attachment' : 'inline';

  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('Content-Length', asset.sizeBytes.toString());
  // Prevents the browser from sniffing a different, potentially executable type.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${encodeURIComponent(path.basename(asset.originalName))}"`,
  );

  fs.createReadStream(absolutePath).pipe(res);
});

/** Returns file metadata without transferring the bytes. */
export const getFileMetadata = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const fileId = req.params['id'] as string;

  const asset = await getFileAssetOrThrow(fileId);

  if (!(await canAccessFile(asset, user))) {
    throw new ForbiddenError('You do not have permission to access this file');
  }

  sendSuccess(
    res,
    {
      id: asset.id,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      category: asset.category,
      createdAt: asset.createdAt,
    },
    'File metadata retrieved successfully',
  );
});
