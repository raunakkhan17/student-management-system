import { api } from '@/lib/api-client';
import type { DashboardCharts, DashboardSummary } from '@/types/dashboard';

const BASE = '/dashboard';

export const dashboardService = {
  getSummary: () => api.get<DashboardSummary>(`${BASE}/summary`),

  /** Administrative roles only — the API rejects the rest. */
  getCharts: (days = 30) => api.get<DashboardCharts>(`${BASE}/charts`, { params: { days } }),
};
