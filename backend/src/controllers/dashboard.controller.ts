import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import * as dashboardService from '@/services/dashboard.service';
import { sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import type { DashboardChartsQuery } from '@/validators/dashboard.validator';

export const getSummary = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const summary = await dashboardService.getDashboardSummary(user);
  sendSuccess(res, summary, 'Dashboard loaded successfully');
});

export const getCharts = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { days } = req.query as unknown as DashboardChartsQuery;
  const charts = await dashboardService.getDashboardCharts(user, days);
  sendSuccess(res, charts, 'Dashboard charts loaded successfully');
});
