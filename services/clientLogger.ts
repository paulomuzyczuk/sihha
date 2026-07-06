import type { LogContext } from './logger';

// Browser-safe structured logger. Uses console instead of pino to avoid
// pulling nodemailer into the client bundle (logger.ts → email.ts → nodemailer).
// The `import type` on LogContext is erased at compile time — no runtime dep.
export const clientLogger = {
  info(message: string, ctx: LogContext = {}): void {
    console.info(JSON.stringify({ level: 'info', ...ctx, message }));
  },

  warn(message: string, ctx: LogContext = {}): void {
    console.warn(JSON.stringify({ level: 'warn', ...ctx, message }));
  },

  error(message: string, ctx: LogContext = {}, err?: unknown): void {
    const entry: Record<string, unknown> = { level: 'error', ...ctx, message };
    if (err instanceof Error)
      entry.err = { message: err.message, name: err.name };
    console.error(JSON.stringify(entry));
  },
};
