import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import { auditFromRequest, redact } from '@/services/audit.service';
import * as leaveService from '@/services/leave.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { buildListQuery } from '@/utils/pagination';
import type { ApplyLeaveInput, ReviewLeaveInput } from '@/validators/leave.validator';

const MODULE = 'LEAVE' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

export const listRequests = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = buildListQuery(req.query, {
    allowedSortFields: ['fromDate', 'appliedAt'],
    defaultSortBy: 'fromDate',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await leaveService.listLeaveRequests(user, query, {
    applicantId: req.query['applicantId'] as string | undefined,
    applicantType: req.query['applicantType'] as never,
    type: req.query['type'] as never,
    status: req.query['status'] as never,
    from: req.query['from'] as Date | undefined,
    to: req.query['to'] as Date | undefined,
  });

  sendPaginated(res, items, pagination, 'Leave requests retrieved successfully');
});

export const getRequest = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const request = await leaveService.getLeaveRequest(paramId(req), user);
  sendSuccess(res, request, 'Leave request retrieved successfully');
});

export const applyForLeave = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const body = req.body as ApplyLeaveInput;
  const request = await leaveService.applyForLeave(body, user);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'LeaveRequest',
    entityId: request.id,
    description: `Applied for ${request.totalDays.toString()} day(s) of ${request.type.toLowerCase()} leave`,
    newValue: redact({ type: request.type, fromDate: request.fromDate, toDate: request.toDate }),
  });

  sendCreated(res, request, 'Leave request submitted successfully');
});

export const reviewRequest = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);
  const body = req.body as ReviewLeaveInput;

  const request = await leaveService.reviewLeave(id, body, user.id);

  await auditFromRequest(req, {
    action: 'APPROVE',
    module: MODULE,
    entityType: 'LeaveRequest',
    entityId: id,
    description: `${body.status === 'APPROVED' ? 'Approved' : 'Rejected'} a leave request for ${request.applicant.firstName} ${request.applicant.lastName}`,
    newValue: redact({ status: request.status, reviewComment: request.reviewComment }),
  });

  sendSuccess(
    res,
    request,
    body.status === 'APPROVED' ? 'Leave approved' : 'Leave request rejected',
  );
});

export const cancelRequest = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);

  const request = await leaveService.cancelLeave(id, user);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'LeaveRequest',
    entityId: id,
    description: 'Cancelled a leave request',
  });

  sendSuccess(res, request, 'Leave request cancelled');
});

export const getCalendar = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);

  const entries = await leaveService.getLeaveCalendar(
    user,
    req.query['from'] as unknown as Date,
    req.query['to'] as unknown as Date,
    req.query['applicantType'] as never,
  );

  sendSuccess(res, entries, 'Leave calendar retrieved successfully');
});

export const getBalances = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);

  const balances = await leaveService.getLeaveBalances(user, {
    userId: req.query['userId'] as string | undefined,
    academicYearId: req.query['academicYearId'] as string | undefined,
  });

  sendSuccess(res, balances, 'Leave balances retrieved successfully');
});

export const saveBalances = asyncHandler(async (req: Request, res: Response) => {
  const balances = await leaveService.saveLeaveBalances(req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'LeaveBalance',
    entityId: (req.body as { userId: string }).userId,
    description: 'Updated leave allowances',
    newValue: redact(req.body),
  });

  sendSuccess(res, balances, 'Leave allowances saved successfully');
});

export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const stats = await leaveService.getLeaveStats(user);
  sendSuccess(res, stats, 'Leave statistics retrieved successfully');
});
