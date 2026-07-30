import { env } from './env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minimumWeight = env.isProduction ? LEVEL_WEIGHT.info : LEVEL_WEIGHT.debug;

const ESC = String.fromCharCode(27);
const RESET = `${ESC}[0m`;

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: `${ESC}[90m`,
  info: `${ESC}[36m`,
  warn: `${ESC}[33m`,
  error: `${ESC}[31m`,
};

function formatPretty(level: LogLevel, message: string, meta?: unknown): string {
  const time = new Date().toISOString().slice(11, 23);
  const head = `${LEVEL_COLOR[level]}${level.toUpperCase().padEnd(5)}${RESET} ${time} ${message}`;
  if (meta === undefined) return head;
  return `${head} ${typeof meta === 'string' ? meta : JSON.stringify(meta)}`;
}

function write(level: LogLevel, message: string, meta?: unknown): void {
  if (LEVEL_WEIGHT[level] < minimumWeight) return;

  const serialized = env.isProduction
    ? JSON.stringify({
        level,
        time: new Date().toISOString(),
        message,
        ...(meta !== undefined ? { meta } : {}),
      })
    : formatPretty(level, message, meta);

  if (level === 'error' || level === 'warn') {
    process.stderr.write(`${serialized}\n`);
  } else {
    process.stdout.write(`${serialized}\n`);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => write('debug', message, meta),
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};
