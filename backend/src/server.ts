import type { Server } from 'node:http';
import { createApp } from '@/app';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { connectDatabase, disconnectDatabase } from '@/config/prisma';
import { ensureUploadDirectories } from '@/services/file.service';

let server: Server | undefined;

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully`);

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await disconnectDatabase();
    clearTimeout(forceExit);
    process.exit(exitCode);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

async function bootstrap(): Promise<void> {
  await ensureUploadDirectories();
  await connectDatabase();

  const app = createApp();

  server = app.listen(env.PORT, () => {
    logger.info(`EduCore API listening on http://localhost:${env.PORT}${env.API_PREFIX}`, {
      environment: env.NODE_ENV,
    });
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.stack : String(reason),
  });
  void shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.stack ?? error.message });
  void shutdown('uncaughtException', 1);
});

bootstrap().catch((error: unknown) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.stack : String(error),
  });
  process.exit(1);
});
