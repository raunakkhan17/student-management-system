import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import * as assignmentService from '@/services/assignment.service';
import { auditFromRequest, redact } from '@/services/audit.service';
import { discardUploadedFiles, persistFileAsset } from '@/services/file.service';
import { ForbiddenError } from '@/utils/api-error';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { buildListQuery } from '@/utils/pagination';
import type {
  CreateAssignmentInput,
  EvaluateSubmissionInput,
  SubmitAssignmentInput,
  UpdateAssignmentInput,
} from '@/validators/assignment.validator';

const MODULE = 'ASSIGNMENTS' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

/** Multer puts multiple files on `req.files`; normalise to an array. */
function uploadedFiles(req: Request): Express.Multer.File[] {
  if (Array.isArray(req.files)) return req.files;
  return [];
}

export const listAssignments = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = buildListQuery(req.query, {
    allowedSortFields: ['dueDate', 'title', 'createdAt'],
    defaultSortBy: 'dueDate',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await assignmentService.listAssignments(user, query, {
    classId: req.query['classId'] as string | undefined,
    sectionId: req.query['sectionId'] as string | undefined,
    subjectId: req.query['subjectId'] as string | undefined,
    teacherId: req.query['teacherId'] as string | undefined,
    status: req.query['status'] as never,
    dueFrom: req.query['dueFrom'] as Date | undefined,
    dueTo: req.query['dueTo'] as Date | undefined,
    onlyPending: req.query['onlyPending'] as boolean | undefined,
  });

  sendPaginated(res, items, pagination, 'Assignments retrieved successfully');
});

export const getAssignment = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const assignment = await assignmentService.getAssignment(user, paramId(req));
  sendSuccess(res, assignment, 'Assignment retrieved successfully');
});

export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const stats = await assignmentService.getAssignmentStats(user);
  sendSuccess(res, stats, 'Assignment statistics retrieved successfully');
});

export const createAssignment = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const body = req.body as CreateAssignmentInput;
  const files = uploadedFiles(req);

  let assignment;
  try {
    assignment = await assignmentService.createAssignment(user, body);
  } catch (error) {
    // The assignment was rejected, so the uploaded bytes are orphaned.
    await discardUploadedFiles(files);
    throw error;
  }

  for (const file of files) {
    const asset = await persistFileAsset({
      file,
      category: 'ASSIGNMENTS',
      uploadedById: user.id,
    });
    await assignmentService.addAttachment(assignment.id, asset.id);
  }

  await auditFromRequest(req, {
    action: body.publish ? 'PUBLISH' : 'CREATE',
    module: MODULE,
    entityType: 'Assignment',
    entityId: assignment.id,
    description: `${body.publish ? 'Published' : 'Drafted'} assignment "${assignment.title}"`,
    newValue: redact({ title: assignment.title, dueDate: assignment.dueDate, status: assignment.status }),
  });

  const refreshed = await assignmentService.getAssignment(user, assignment.id);
  sendCreated(res, refreshed, body.publish ? 'Assignment published' : 'Assignment saved as draft');
});

export const updateAssignment = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);
  const body = req.body as UpdateAssignmentInput;

  const assignment = await assignmentService.updateAssignment(user, id, body);

  await auditFromRequest(req, {
    action: body.status === 'PUBLISHED' ? 'PUBLISH' : 'UPDATE',
    module: MODULE,
    entityType: 'Assignment',
    entityId: id,
    description: `Updated assignment "${assignment.title}"`,
    newValue: redact(body),
  });

  sendSuccess(res, assignment, 'Assignment updated successfully');
});

export const deleteAssignment = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);

  await assignmentService.deleteAssignment(user, id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Assignment',
    entityId: id,
    description: 'Deleted an assignment',
  });

  sendSuccess(res, null, 'Assignment deleted successfully');
});

export const uploadAttachments = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);
  const files = uploadedFiles(req);

  // Confirms the caller may see (and therefore attach to) this assignment.
  await assignmentService.getAssignment(user, id);

  for (const file of files) {
    const asset = await persistFileAsset({ file, category: 'ASSIGNMENTS', uploadedById: user.id });
    await assignmentService.addAttachment(id, asset.id);
  }

  const assignment = await assignmentService.getAssignment(user, id);
  sendSuccess(res, assignment, `${files.length} attachment(s) added`);
});

export const submitAssignment = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);
  const body = req.body as SubmitAssignmentInput;
  const files = uploadedFiles(req);

  let submission;
  try {
    submission = await assignmentService.submitAssignment(user, id, body.content);
  } catch (error) {
    await discardUploadedFiles(files);
    throw error;
  }

  for (const file of files) {
    const asset = await persistFileAsset({ file, category: 'ASSIGNMENTS', uploadedById: user.id });
    await assignmentService.addSubmissionAttachment(submission.id, asset.id);
  }

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'AssignmentSubmission',
    entityId: submission.id,
    description: `Submitted assignment ${id}`,
    newValue: redact({ status: submission.status, attachments: files.length }),
  });

  sendCreated(
    res,
    submission,
    submission.status === 'LATE' ? 'Submitted (marked late)' : 'Submitted successfully',
  );
});

export const getMySubmission = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);

  if (!user.studentId) {
    throw new ForbiddenError('Only students have submissions');
  }

  const submission = await assignmentService.getSubmissionForStudent(id, user.studentId);
  sendSuccess(res, submission, 'Submission retrieved successfully');
});

export const listSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = buildListQuery(req.query, {
    allowedSortFields: ['submittedAt'],
    defaultSortBy: 'submittedAt',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await assignmentService.listSubmissions(
    user,
    paramId(req),
    query,
    req.query['status'] as string | undefined,
  );

  sendPaginated(res, items, pagination, 'Submissions retrieved successfully');
});

export const evaluateSubmission = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const submissionId = req.params['submissionId'] as string;
  const body = req.body as EvaluateSubmissionInput;

  const submission = await assignmentService.evaluateSubmission(user, submissionId, body);

  await auditFromRequest(req, {
    action: 'APPROVE',
    module: MODULE,
    entityType: 'AssignmentSubmission',
    entityId: submissionId,
    description: `Marked submission for ${submission.student.admissionNumber}: ${String(body.marksObtained)}`,
    newValue: redact({ marksObtained: body.marksObtained, status: body.status }),
  });

  sendSuccess(
    res,
    submission,
    body.status === 'RESUBMIT' ? 'Returned to the student for resubmission' : 'Submission marked',
  );
});
