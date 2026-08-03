import { z } from 'zod';

/**
 * How far back the trend charts reach. Capped at a year so a hand-edited query
 * string cannot ask the database to scan the whole attendance table.
 */
export const dashboardChartsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
});

export type DashboardChartsQuery = z.infer<typeof dashboardChartsQuerySchema>;
