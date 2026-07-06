import pino from 'pino';

// NOTE: this module must NOT import ./email. email.ts depends on this logger;
// importing email here would create a cycle (the reason email.ts previously had
// to inline its own logging). Critical-event email escalation lives in
// ./alerting, which is free to depend on both.
//   Ref: Ousterhout, APoSD — dependencies / information leakage.

export interface LogContext {
  route?: string;
  action?: string;
  status?: number;
  durationMs?: number;
  userId?: string;
  [key: string]: unknown;
}

const pinoLogger = pino({ enabled: process.env.NODE_ENV !== 'test' });

function toErrObject(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  return { message: String(err) };
}

export const logger = {
  info(message: string, ctx: LogContext = {}): void {
    pinoLogger.info(ctx, message);
  },

  warn(message: string, ctx: LogContext = {}): void {
    pinoLogger.warn(ctx, message);
  },

  error(message: string, ctx: LogContext = {}, err?: unknown): void {
    const merged = err !== undefined ? { ...ctx, err: toErrObject(err) } : ctx;
    pinoLogger.error(merged, message);
  },
};
