import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import { auditFromRequest, redact } from '@/services/audit.service';
import { discardUploadedFiles, persistFileAsset } from '@/services/file.service';
import * as noticeService from '@/services/notice.service';
import { hasPermission } from '@/services/permission.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { buildListQuery } from '@/utils/pagination';
import type {
  AnnouncementInput,
  CreateNoticeInput,
  PublishNoticeInput,
} from '@/validators/notice.validator';

const MODULE = 'NOTICES' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

/** Managers see drafts and scheduled notices; everyone else sees published ones. */
async function canManageNotices(req: Request): Promise<boolean> {
  const user = requireUser(req);
  return hasPermission(user.role, MODULE, 'CREATE');
}

export const listNotices = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const canManage = await canManageNotices(req);

  const query = buildListQuery(req.query, {
    allowedSortFields: ['publishAt', 'createdAt', 'title'],
    defaultSortBy: 'publishAt',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await noticeService.listNotices(
    user,
    query,
    {
      category: req.query['category'] as never,
      status: req.query['status'] as never,
      priority: req.query['priority'] as never,
      onlyUnread: req.query['onlyUnread'] as boolean | undefined,
      onlyPinned: req.query['onlyPinned'] as boolean | undefined,
    },
    canManage,
  );

  sendPaginated(res, items, pagination, 'Notices retrieved successfully');
});

export const getNotice = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const canManage = await canManageNotices(req);
  const notice = await noticeService.getNotice(paramId(req), user, canManage);
  sendSuccess(res, notice, 'Notice retrieved successfully');
});

export const createNotice = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const body = req.body as CreateNoticeInput;

  const notice = await noticeService.createNotice(body, user.id);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Notice',
    entityId: notice.id,
    description: `${body.publishNow ? 'Published' : 'Drafted'} notice "${notice.title}"`,
    newValue: redact({ category: notice.category, priority: notice.priority, status: notice.status }),
  });

  sendCreated(
    res,
    notice,
    body.publishNow ? 'Notice published successfully' : 'Notice saved successfully',
  );
});

export const updateNotice = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const notice = await noticeService.updateNotice(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Notice',
    entityId: id,
    description: `Updated notice "${notice.title}"`,
    newValue: redact(req.body),
  });

  sendSuccess(res, notice, 'Notice updated successfully');
});

export const publishNotice = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const body = req.body as PublishNoticeInput;

  const notice = await noticeService.publishNotice(id, body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Notice',
    entityId: id,
    description:
      notice.status === 'SCHEDULED'
        ? `Scheduled notice "${notice.title}" for ${notice.publishAt?.toISOString() ?? ''}`
        : `Published notice "${notice.title}"`,
  });

  sendSuccess(
    res,
    notice,
    notice.status === 'SCHEDULED' ? 'Notice scheduled successfully' : 'Notice published successfully',
  );
});

export const setPinned = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const { isPinned } = req.body as { isPinned: boolean };

  const notice = await noticeService.setPinned(id, isPinned);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Notice',
    entityId: id,
    description: `${isPinned ? 'Pinned' : 'Unpinned'} notice "${notice.title}"`,
  });

  sendSuccess(res, notice, isPinned ? 'Notice pinned' : 'Notice unpinned');
});

export const deleteNotice = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await noticeService.deleteNotice(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Notice',
    entityId: id,
    description: 'Removed a notice',
  });

  sendSuccess(res, null, 'Notice removed successfully');
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await noticeService.markNoticeRead(paramId(req), user.id);
  sendSuccess(res, result, 'Notice marked as read');
});

export const uploadAttachments = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];

  if (files.length === 0) {
    sendSuccess(res, null, 'No files were uploaded');
    return;
  }

  try {
    const assets = await Promise.all(
      files.map((file) => persistFileAsset({ file, category: 'NOTICES', uploadedById: user.id })),
    );

    const notice = await noticeService.addAttachments(
      id,
      assets.map((asset) => asset.id),
    );

    await auditFromRequest(req, {
      action: 'UPDATE',
      module: MODULE,
      entityType: 'Notice',
      entityId: id,
      description: `Attached ${assets.length} file(s) to "${notice.title}"`,
    });

    sendCreated(res, notice, 'Attachments uploaded successfully');
  } catch (error) {
    // Never leave orphaned files on disk when the database write fails.
    await discardUploadedFiles(files);
    throw error;
  }
});

export const removeAttachment = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const fileId = req.params['fileId'] as string;

  await noticeService.removeAttachment(id, fileId);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Notice',
    entityId: id,
    description: 'Removed a notice attachment',
  });

  sendSuccess(res, null, 'Attachment removed successfully');
});

export const runSchedule = asyncHandler(async (req: Request, res: Response) => {
  const result = await noticeService.runNoticeSchedule();

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Notice',
    description: `Published ${result.published} scheduled notice(s), expired ${result.expired}`,
  });

  sendSuccess(
    res,
    result,
    `${result.published} notice(s) published, ${result.expired} expired`,
  );
});

export const sendAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as AnnouncementInput;
  const result = await noticeService.sendAnnouncement(body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Notification',
    description: `Announced "${body.title}" to ${result.delivered} recipient(s)`,
  });

  sendCreated(res, result, `Announcement sent to ${result.delivered} recipient(s)`);
});

export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const canManage = await canManageNotices(req);
  const stats = await noticeService.getNoticeStats(user, canManage);
  sendSuccess(res, stats, 'Notice statistics retrieved successfully');
});
