import type { Request, Response } from 'express';
import { auditFromRequest, redact } from '@/services/audit.service';
import * as settingsService from '@/services/settings.service';
import { sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import type { AttendanceRulesInput, InstitutionInput } from '@/validators/settings.validator';

const MODULE = 'SETTINGS' as const;

export const getInstitution = asyncHandler(async (_req: Request, res: Response) => {
  const institution = await settingsService.getInstitution();
  sendSuccess(res, institution, 'Institution profile retrieved successfully');
});

export const saveInstitution = asyncHandler(async (req: Request, res: Response) => {
  const before = await settingsService.getInstitution();
  const institution = await settingsService.saveInstitution(req.body as InstitutionInput);

  await auditFromRequest(req, {
    action: before ? 'UPDATE' : 'CREATE',
    module: MODULE,
    entityType: 'Institution',
    entityId: institution.id,
    description: `Updated the institution profile for ${institution.name}`,
    oldValue: redact(before),
    newValue: redact(institution),
  });

  sendSuccess(res, institution, 'Institution profile saved successfully');
});

export const getAttendanceRules = asyncHandler(async (req: Request, res: Response) => {
  const rules = await settingsService.getAttendanceRules(
    req.query['academicYearId'] as string | undefined,
  );
  sendSuccess(res, rules, 'Attendance rules retrieved successfully');
});

export const saveAttendanceRules = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as AttendanceRulesInput;
  const before = await settingsService.getAttendanceRules(body.academicYearId);
  const rules = await settingsService.saveAttendanceRules(body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'AttendanceRule',
    entityId: rules.id,
    description: 'Updated the attendance rules',
    oldValue: redact(before),
    newValue: redact(rules),
  });

  sendSuccess(res, rules, 'Attendance rules saved successfully');
});

export const listEmailTemplates = asyncHandler(async (_req: Request, res: Response) => {
  const templates = await settingsService.listEmailTemplates();
  sendSuccess(res, templates, 'Email templates retrieved successfully');
});

export const getPermissionMatrix = asyncHandler(async (_req: Request, res: Response) => {
  const matrix = await settingsService.getPermissionMatrix();
  sendSuccess(res, matrix, 'Permission matrix retrieved successfully');
});
