import { Router } from 'express';
import { prisma } from '@/config/prisma';
import { sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';

const router = Router();

/** Liveness + database reachability. Intentionally unauthenticated. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const startedAt = process.hrtime.bigint();
    await prisma.$queryRaw`SELECT 1`;
    const databaseLatencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    sendSuccess(
      res,
      {
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        database: { reachable: true, latencyMs: Number(databaseLatencyMs.toFixed(2)) },
        timestamp: new Date().toISOString(),
      },
      'Service is healthy',
    );
  }),
);

export default router;
