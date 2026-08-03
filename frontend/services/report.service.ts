import { httpClient } from '@/lib/api-client';

export type ReportFormat = 'csv' | 'xlsx';

/** Filters a report accepts. Only the ones it declares are sent. */
export interface ReportParams {
  format: ReportFormat;
  from?: string;
  to?: string;
  classId?: string;
  academicYearId?: string;
  examId?: string;
  status?: string;
  month?: number;
  year?: number;
}

/**
 * PRD Module 18. Each report is served by the module that owns the data, so
 * this is a thin catalogue over endpoints that already exist rather than a
 * reporting service of its own.
 *
 * All of these stream a file, bypassing the JSON envelope.
 */
export async function downloadReport(path: string, params: ReportParams): Promise<Blob> {
  const response = await httpClient.get<Blob>(path, { params, responseType: 'blob' });
  return response.data;
}
