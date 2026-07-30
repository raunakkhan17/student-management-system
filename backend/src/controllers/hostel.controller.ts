import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import { auditFromRequest, redact } from '@/services/audit.service';
import * as hostelService from '@/services/hostel.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { sendExport } from '@/utils/export';
import { buildListQuery } from '@/utils/pagination';
import type {
  AllocateRoomInput,
  BulkRoomsInput,
  CreateComplaintInput,
  CreateVisitorInput,
  RoomTransferInput,
} from '@/validators/facility.validator';

const MODULE = 'HOSTEL' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

function query(req: Request, allowedSortFields: readonly string[], defaultSortBy: string, defaultSortOrder: 'asc' | 'desc' = 'asc') {
  return buildListQuery(req.query, { allowedSortFields, defaultSortBy, defaultSortOrder });
}

// -------------------------------------------------------------------- Hostels

export const listHostels = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await hostelService.listHostels(query(req, ['name', 'code'], 'name'));
  sendPaginated(res, items, pagination, 'Hostels retrieved successfully');
});

export const getHostel = asyncHandler(async (req: Request, res: Response) => {
  const hostel = await hostelService.getHostel(paramId(req));
  sendSuccess(res, hostel, 'Hostel retrieved successfully');
});

export const createHostel = asyncHandler(async (req: Request, res: Response) => {
  const hostel = await hostelService.createHostel(req.body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Hostel',
    entityId: hostel.id,
    description: `Created hostel ${hostel.name} (${hostel.code})`,
    newValue: redact(hostel),
  });

  sendCreated(res, hostel, 'Hostel created successfully');
});

export const updateHostel = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const hostel = await hostelService.updateHostel(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Hostel',
    entityId: id,
    description: `Updated hostel ${hostel.name}`,
    newValue: redact(req.body),
  });

  sendSuccess(res, hostel, 'Hostel updated successfully');
});

export const deleteHostel = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await hostelService.deleteHostel(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Hostel',
    entityId: id,
    description: 'Removed a hostel',
  });

  sendSuccess(res, null, 'Hostel removed successfully');
});

// ---------------------------------------------------------------------- Rooms

export const listRooms = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await hostelService.listRooms(query(req, ['roomNumber'], 'roomNumber'), {
    hostelId: req.query['hostelId'] as string | undefined,
    status: req.query['status'] as never,
    type: req.query['type'] as never,
    onlyAvailable: req.query['onlyAvailable'] as boolean | undefined,
  });

  sendPaginated(res, items, pagination, 'Rooms retrieved successfully');
});

export const createRoom = asyncHandler(async (req: Request, res: Response) => {
  const room = await hostelService.createRoom(req.body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'HostelRoom',
    entityId: room.id,
    description: `Added room ${room.roomNumber} to ${room.hostel.name}`,
    newValue: redact(req.body),
  });

  sendCreated(res, room, 'Room added successfully');
});

export const createRoomsInBulk = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as BulkRoomsInput;
  const result = await hostelService.createRoomsInBulk(body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'HostelRoom',
    entityId: body.hostelId,
    description: `Created ${result.created} room(s) in the range ${body.fromNumber}–${body.toNumber}`,
  });

  sendCreated(
    res,
    result,
    result.skipped.length === 0
      ? `${result.created} room(s) created successfully`
      : `${result.created} room(s) created — ${result.skipped.length} already existed`,
  );
});

export const updateRoom = asyncHandler(async (req: Request, res: Response) => {
  const roomId = req.params['roomId'] as string;
  const room = await hostelService.updateRoom(roomId, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'HostelRoom',
    entityId: roomId,
    description: `Updated room ${room.roomNumber}`,
    newValue: redact(req.body),
  });

  sendSuccess(res, room, 'Room updated successfully');
});

export const deleteRoom = asyncHandler(async (req: Request, res: Response) => {
  const roomId = req.params['roomId'] as string;
  await hostelService.deleteRoom(roomId);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'HostelRoom',
    entityId: roomId,
    description: 'Removed a hostel room',
  });

  sendSuccess(res, null, 'Room removed successfully');
});

// ----------------------------------------------------------------- Allocations

export const listAllocations = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await hostelService.listAllocations(
    query(req, ['allocatedFrom'], 'allocatedFrom', 'desc'),
    {
      hostelId: req.query['hostelId'] as string | undefined,
      roomId: req.query['roomId'] as string | undefined,
      studentId: req.query['studentId'] as string | undefined,
      status: req.query['status'] as never,
    },
  );

  sendPaginated(res, items, pagination, 'Allocations retrieved successfully');
});

export const allocateRoom = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const allocation = await hostelService.allocateRoom(req.body as AllocateRoomInput, user.id);

  await auditFromRequest(req, {
    action: 'ASSIGN',
    module: MODULE,
    entityType: 'HostelAllocation',
    entityId: allocation.id,
    description: `Allocated room ${allocation.room.roomNumber} to ${allocation.student.user.firstName} ${allocation.student.user.lastName}`,
    newValue: redact({ roomId: allocation.roomId, bedNumber: allocation.bedNumber }),
  });

  sendCreated(res, allocation, 'Room allocated successfully');
});

export const vacateRoom = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const allocation = await hostelService.vacateRoom(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'HostelAllocation',
    entityId: id,
    description: `Vacated room ${allocation.room.roomNumber}`,
    newValue: redact({ allocatedTo: allocation.allocatedTo, status: allocation.status }),
  });

  sendSuccess(res, allocation, 'Room vacated successfully');
});

// -------------------------------------------------------------- Room transfers

export const listRoomTransfers = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await hostelService.listRoomTransfers(
    query(req, ['requestedAt'], 'requestedAt', 'desc'),
    req.query['status'] as string | undefined,
  );

  sendPaginated(res, items, pagination, 'Transfer requests retrieved successfully');
});

export const requestRoomTransfer = asyncHandler(async (req: Request, res: Response) => {
  const transfer = await hostelService.requestRoomTransfer(req.body as RoomTransferInput);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'RoomTransfer',
    entityId: transfer.id,
    description: `Requested a transfer from room ${transfer.fromRoom.roomNumber} to ${transfer.toRoom.roomNumber}`,
  });

  sendCreated(res, transfer, 'Transfer request submitted successfully');
});

export const reviewRoomTransfer = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);
  const transfer = await hostelService.reviewRoomTransfer(id, req.body, user.id);

  await auditFromRequest(req, {
    action: 'APPROVE',
    module: MODULE,
    entityType: 'RoomTransfer',
    entityId: id,
    description: `${transfer.status === 'APPROVED' ? 'Approved' : 'Rejected'} a room transfer request`,
    newValue: redact({ status: transfer.status, reviewComment: transfer.reviewComment }),
  });

  sendSuccess(
    res,
    transfer,
    transfer.status === 'APPROVED' ? 'Transfer approved and applied' : 'Transfer request rejected',
  );
});

// -------------------------------------------------------------------- Visitors

export const listVisitors = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await hostelService.listVisitors(
    query(req, ['checkInAt'], 'checkInAt', 'desc'),
    {
      hostelId: req.query['hostelId'] as string | undefined,
      studentId: req.query['studentId'] as string | undefined,
      onlyInside: req.query['onlyInside'] as boolean | undefined,
      from: req.query['from'] as Date | undefined,
      to: req.query['to'] as Date | undefined,
    },
  );

  sendPaginated(res, items, pagination, 'Visitors retrieved successfully');
});

export const logVisitor = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const visitor = await hostelService.logVisitor(req.body as CreateVisitorInput, user.id);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'HostelVisitor',
    entityId: visitor.id,
    description: `Logged visitor ${visitor.visitorName} for ${visitor.student.admissionNumber}`,
  });

  sendCreated(res, visitor, 'Visitor checked in successfully');
});

export const checkOutVisitor = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const { checkOutAt } = req.body as { checkOutAt: Date };
  const visitor = await hostelService.checkOutVisitor(id, checkOutAt);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'HostelVisitor',
    entityId: id,
    description: `Checked out visitor ${visitor.visitorName}`,
  });

  sendSuccess(res, visitor, 'Visitor checked out successfully');
});

// ------------------------------------------------------------------ Mess plans

export const listMessPlans = asyncHandler(async (req: Request, res: Response) => {
  const plans = await hostelService.listMessPlans(req.query['hostelId'] as string | undefined);
  sendSuccess(res, plans, 'Mess plans retrieved successfully');
});

export const createMessPlan = asyncHandler(async (req: Request, res: Response) => {
  const plan = await hostelService.createMessPlan(req.body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'MessPlan',
    entityId: plan.id,
    description: `Created mess plan ${plan.name}`,
    newValue: redact(req.body),
  });

  sendCreated(res, plan, 'Mess plan created successfully');
});

export const subscribeToMessPlan = asyncHandler(async (req: Request, res: Response) => {
  const subscription = await hostelService.subscribeToMessPlan(req.body);

  await auditFromRequest(req, {
    action: 'ASSIGN',
    module: MODULE,
    entityType: 'StudentMessPlan',
    entityId: subscription.id,
    description: `Subscribed a student to ${subscription.messPlan.name}`,
  });

  sendCreated(res, subscription, 'Mess plan subscribed successfully');
});

// ------------------------------------------------------------------ Complaints

export const listComplaints = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { items, pagination } = await hostelService.listComplaints(
    user,
    query(req, ['createdAt', 'priority'], 'createdAt', 'desc'),
    {
      hostelId: req.query['hostelId'] as string | undefined,
      studentId: req.query['studentId'] as string | undefined,
      category: req.query['category'] as never,
      status: req.query['status'] as string[] | undefined,
      priority: req.query['priority'] as never,
    },
  );

  sendPaginated(res, items, pagination, 'Complaints retrieved successfully');
});

export const createComplaint = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const complaint = await hostelService.createComplaint(req.body as CreateComplaintInput, user);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'HostelComplaint',
    entityId: complaint.id,
    description: `Raised a ${complaint.category.toLowerCase()} complaint: ${complaint.title}`,
  });

  sendCreated(res, complaint, 'Complaint raised successfully');
});

export const updateComplaint = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const complaint = await hostelService.updateComplaint(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'HostelComplaint',
    entityId: id,
    description: `Updated complaint "${complaint.title}" to ${complaint.status}`,
    newValue: redact(req.body),
  });

  sendSuccess(res, complaint, 'Complaint updated successfully');
});

// ------------------------------------------------------------- Stats & reports

export const getStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await hostelService.getHostelStats();
  sendSuccess(res, stats, 'Hostel statistics retrieved successfully');
});

export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const format = (req.query['format'] as 'csv' | 'xlsx' | undefined) ?? 'xlsx';
  const rows = await hostelService.getHostelReportRows(req.query['hostelId'] as string | undefined);

  await auditFromRequest(req, {
    action: 'EXPORT',
    module: MODULE,
    entityType: 'HostelAllocation',
    description: `Exported ${rows.length} hostel occupancy record(s)`,
  });

  await sendExport(
    res,
    rows,
    `hostel-occupancy-${new Date().toISOString().slice(0, 10)}`,
    format,
    'Occupancy',
  );
});
