import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import { auditFromRequest, redact } from '@/services/audit.service';
import * as examService from '@/services/exam/exam.service';
import * as gradeService from '@/services/exam/grade.service';
import * as reportCardService from '@/services/exam/report-card.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { buildListQuery } from '@/utils/pagination';
import type {
  CreateExamInput,
  EnterMarksInput,
  ExamScheduleInput,
} from '@/validators/exam.validator';

const MODULE = 'EXAMS' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

// ------------------------------------------------------------------- Exams

export const listExams = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = buildListQuery(req.query, {
    allowedSortFields: ['startDate', 'name', 'createdAt'],
    defaultSortBy: 'startDate',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await examService.listExams(user, query, {
    academicYearId: req.query['academicYearId'] as string | undefined,
    semesterId: req.query['semesterId'] as string | undefined,
    classId: req.query['classId'] as string | undefined,
    type: req.query['type'] as never,
    status: req.query['status'] as never,
  });

  sendPaginated(res, items, pagination, 'Exams retrieved successfully');
});

export const getExam = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const exam = await examService.getExam(user, paramId(req));
  sendSuccess(res, exam, 'Exam retrieved successfully');
});

export const createExam = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const exam = await examService.createExam(req.body as CreateExamInput, user.id);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Exam',
    entityId: exam.id,
    description: `Created exam ${exam.name}`,
    newValue: redact({ name: exam.name, type: exam.type, startDate: exam.startDate }),
  });

  sendCreated(res, exam, 'Exam created successfully');
});

export const updateExam = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const exam = await examService.updateExam(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Exam',
    entityId: id,
    description: `Updated exam ${exam.name}`,
    newValue: redact(req.body),
  });

  sendSuccess(res, exam, 'Exam updated successfully');
});

export const deleteExam = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await examService.deleteExam(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Exam',
    entityId: id,
    description: 'Deleted an exam',
  });

  sendSuccess(res, null, 'Exam deleted successfully');
});

// ---------------------------------------------------------------- Schedules

export const addSchedule = asyncHandler(async (req: Request, res: Response) => {
  const examId = paramId(req);
  const schedule = await examService.addSchedule(examId, req.body as ExamScheduleInput);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'ExamSchedule',
    entityId: schedule.id,
    description: `Scheduled ${schedule.subject.name} for ${schedule.class.name}`,
    newValue: redact(schedule),
  });

  sendCreated(res, schedule, 'Exam paper scheduled successfully');
});

export const updateSchedule = asyncHandler(async (req: Request, res: Response) => {
  const scheduleId = req.params['scheduleId'] as string;
  const schedule = await examService.updateSchedule(scheduleId, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'ExamSchedule',
    entityId: scheduleId,
    description: `Updated the ${schedule.subject.name} paper`,
    newValue: redact(req.body),
  });

  sendSuccess(res, schedule, 'Exam paper updated successfully');
});

export const deleteSchedule = asyncHandler(async (req: Request, res: Response) => {
  const scheduleId = req.params['scheduleId'] as string;
  await examService.deleteSchedule(scheduleId);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'ExamSchedule',
    entityId: scheduleId,
    description: 'Removed an exam paper',
  });

  sendSuccess(res, null, 'Exam paper removed successfully');
});

// -------------------------------------------------------------------- Marks

export const getMarksSheet = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const sheet = await examService.getMarksSheet(user, req.params['scheduleId'] as string);
  sendSuccess(res, sheet, 'Marks sheet retrieved successfully');
});

export const enterMarks = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const scheduleId = req.params['scheduleId'] as string;
  const body = req.body as EnterMarksInput;

  const sheet = await examService.enterMarks(user, scheduleId, body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Mark',
    entityId: scheduleId,
    description: `Entered ${body.marks.length} mark(s) for ${sheet.schedule.subject.name}`,
    newValue: redact({ count: body.marks.length }),
  });

  sendSuccess(res, sheet, 'Marks saved successfully');
});

export const getMarksProgress = asyncHandler(async (req: Request, res: Response) => {
  const progress = await examService.getMarksProgress(paramId(req));
  sendSuccess(res, progress, 'Marks entry progress retrieved successfully');
});

// ------------------------------------------------------------------ Results

export const publishResults = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const examId = paramId(req);
  const { allowIncomplete } = req.body as { allowIncomplete: boolean };

  const result = await reportCardService.publishResults(examId, user.id, allowIncomplete);

  await auditFromRequest(req, {
    action: 'PUBLISH',
    module: MODULE,
    entityType: 'Exam',
    entityId: examId,
    description: `Published results for ${result.published} student(s)`,
    newValue: redact(result),
  });

  sendSuccess(res, result, `Results published for ${result.published} student(s)`);
});

export const withdrawResults = asyncHandler(async (req: Request, res: Response) => {
  const examId = paramId(req);
  await reportCardService.withdrawResults(examId);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Exam',
    entityId: examId,
    description: 'Withdrew published results',
  });

  sendSuccess(res, null, 'Results withdrawn. Marks can now be corrected.');
});

export const getRankings = asyncHandler(async (req: Request, res: Response) => {
  const rankings = await reportCardService.getRankings(paramId(req));
  sendSuccess(res, rankings, 'Rankings retrieved successfully');
});

export const getStatistics = asyncHandler(async (req: Request, res: Response) => {
  const stats = await reportCardService.getExamStatistics(paramId(req));
  sendSuccess(res, stats, 'Exam statistics retrieved successfully');
});

// ------------------------------------------------------------- Report cards

export const listReportCards = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = buildListQuery(req.query, {
    allowedSortFields: ['percentage', 'rank'],
    defaultSortBy: 'rank',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await reportCardService.listReportCards(user, query, {
    examId: req.query['examId'] as string | undefined,
    studentId: req.query['studentId'] as string | undefined,
    classId: req.query['classId'] as string | undefined,
    academicYearId: req.query['academicYearId'] as string | undefined,
  });

  sendPaginated(res, items, pagination, 'Report cards retrieved successfully');
});

export const getReportCard = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const card = await reportCardService.getReportCard(user, paramId(req));
  sendSuccess(res, card, 'Report card retrieved successfully');
});

export const getStudentResult = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await reportCardService.getStudentResult(
    user,
    req.params['studentId'] as string,
    req.params['examId'] as string,
  );
  sendSuccess(res, result, 'Result retrieved successfully');
});

// ------------------------------------------------------------- Grade scales

export const listGradeScales = asyncHandler(async (_req: Request, res: Response) => {
  const scales = await gradeService.listGradeScales();
  sendSuccess(res, scales, 'Grade scales retrieved successfully');
});

export const getGradeScale = asyncHandler(async (req: Request, res: Response) => {
  const scale = await gradeService.getGradeScale(paramId(req));
  sendSuccess(res, scale, 'Grade scale retrieved successfully');
});

export const createGradeScale = asyncHandler(async (req: Request, res: Response) => {
  const scale = await gradeService.createGradeScale(req.body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'GradeScale',
    entityId: scale.id,
    description: `Created grade scale ${scale.name}`,
    newValue: redact(scale),
  });

  sendCreated(res, scale, 'Grade scale created successfully');
});

export const updateGradeScale = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const scale = await gradeService.updateGradeScale(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'GradeScale',
    entityId: id,
    description: `Updated grade scale ${scale.name}`,
    newValue: redact(scale),
  });

  sendSuccess(res, scale, 'Grade scale updated successfully');
});

export const deleteGradeScale = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await gradeService.deleteGradeScale(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'GradeScale',
    entityId: id,
    description: 'Deleted a grade scale',
  });

  sendSuccess(res, null, 'Grade scale deleted successfully');
});
