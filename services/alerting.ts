import { logger, LogContext } from './logger';
import { sendEmailAlert } from './email';

/**
 * Logs a critical event at error level and escalates it by email to the admin.
 *
 * This lives outside logger.ts on purpose: logger must not depend on email, so
 * that email can depend on logger without a circular import. This module sits
 * above both and is free to use each.
 *   Ref: Ousterhout, A Philosophy of Software Design — dependencies are the
 *   primary source of complexity; Thomas & Hunt, PP Ch.2, Tip 15 (DRY).
 *
 * The email body is intentionally limited to route + message and never includes
 * PII fields (e.g. userId) that may be present in `ctx`.
 */
export async function criticalAlert(
  message: string,
  ctx: LogContext = {},
): Promise<void> {
  logger.error(message, { ...ctx, critical: true });

  const adminEmail = process.env.ALERT_EMAIL_ADMIN;
  if (!adminEmail) return;

  try {
    await sendEmailAlert(
      adminEmail,
      `[sihha] CRITICAL: ${message}`,
      `Route: ${ctx.route ?? 'unknown'}\nMessage: ${message}`,
    );
  } catch {
    // email failure must never crash the app
  }
}
