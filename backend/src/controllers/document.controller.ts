import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import { auditFromRequest, redact } from '@/services/audit.service';
import * as documentService from '@/services/document.service';
import { discardUploadedFiles, persistFileAsset } from '@/services/file.service';
import { hasPermission } from '@/services/permission.service';
import { BadRequestError } from '@/utils/api-error';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { buildListQuery } from '@/utils/pagination';
import type { UploadDocumentInput, VerifyDocumentInput } from '@/validators/document.validator';

const MODULE = 'DOCUMENTS' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

/** Only staff with EXPORT rights over documents see other people's paperwork. */
async function canViewAll(req: Request): Promise<boolean> {
  const user = requireUser(req);
  return hasPermission(user.role, MODULE, 'APPROVE');
}

export const listDocuments = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = buildListQuery(req.query, {
    allowedSortFields: ['createdAt', 'title', 'expiryDate'],
    defaultSortBy: 'createdAt',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await documentService.listDocuments(
    user,
    query,
    {
      studentId: req.query['studentId'] as string | undefined,
      teacherId: req.query['teacherId'] as string | undefined,
      type: req.query['type'] as never,
      status: req.query['status'] as never,
      expiringSoon: req.query['expiringSoon'] as boolean | undefined,
    },
    await canViewAll(req),
  );

  sendPaginated(res, items, pagination, 'Documents retrieved successfully');
});

export const getDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const document = await documentService.getDocument(paramId(req), user, await canViewAll(req));
  sendSuccess(res, document, 'Document retrieved successfully');
});

export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const file = req.file;

  if (!file) {
    throw new BadRequestError('Choose a file to upload', [
      { field: 'file', message: 'A file is required' },
    ]);
  }

  const body = req.body as UploadDocumentInput;

  try {
    const asset = await persistFileAsset({
      file,
      category: 'DOCUMENTS',
      uploadedById: user.id,
    });

    const document = await documentService.createDocument({
      fileId: asset.id,
      type: body.type,
      title: body.title,
      studentId: body.studentId ?? null,
      teacherId: body.teacherId ?? null,
      ...(body.issuedDate ? { issuedDate: body.issuedDate } : {}),
      ...(body.expiryDate ? { expiryDate: body.expiryDate } : {}),
      ...(body.remarks ? { remarks: body.remarks } : {}),
    });

    await auditFromRequest(req, {
      action: 'CREATE',
      module: MODULE,
      entityType: 'Document',
      entityId: document.id,
      description: `Uploaded "${document.title}" (${document.type})`,
      newValue: redact({ type: document.type, title: document.title }),
    });

    sendCreated(res, document, 'Document uploaded successfully');
  } catch (error) {
    // A file with no document row is unreachable, so remove it.
    await discardUploadedFiles([file]);
    throw error;
  }
});

export const updateDocument = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const document = await documentService.updateDocument(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Document',
    entityId: id,
    description: `Updated document "${document.title}"`,
    newValue: redact(req.body),
  });

  sendSuccess(res, document, 'Document updated successfully');
});

export const verifyDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);
  const body = req.body as VerifyDocumentInput;

  const document = await documentService.verifyDocument(id, body, user.id);

  await auditFromRequest(req, {
    action: 'APPROVE',
    module: MODULE,
    entityType: 'Document',
    entityId: id,
    description: `${body.status === 'VERIFIED' ? 'Verified' : 'Rejected'} document "${document.title}"`,
    newValue: redact({ status: document.status, remarks: document.remarks }),
  });

  sendSuccess(
    res,
    document,
    body.status === 'VERIFIED' ? 'Document verified' : 'Document rejected',
  );
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);

  await documentService.deleteDocument(id, user, await hasPermission(user.role, MODULE, 'DELETE'));

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Document',
    entityId: id,
    description: 'Removed a document',
  });

  sendSuccess(res, null, 'Document removed successfully');
});

export const listExpiring = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const documents = await documentService.listExpiringDocuments(user, await canViewAll(req));
  sendSuccess(res, documents, 'Expiring documents retrieved successfully');
});

export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const stats = await documentService.getDocumentStats(user, await canViewAll(req));
  sendSuccess(res, stats, 'Document statistics retrieved successfully');
});
