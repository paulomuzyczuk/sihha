import nodemailer from 'nodemailer';
import {
  DEFAULT_LOCALE,
  Locale,
  LOCALES,
  translate,
  TranslationKey,
  TranslationVars,
} from '../lib/i18n/dictionaries';
import { logger } from './logger';

/**
 * Locale for outbound alert e-mails. E-mails render server-side, where the
 * per-browser UI language preference does not exist, so the instance operator
 * picks one via EMAIL_LOCALE ('pt' | 'en'). Unset or invalid values fall back
 * to DEFAULT_LOCALE.
 */
export function emailLocale(): Locale {
  const env = process.env.EMAIL_LOCALE;
  return (LOCALES as readonly string[]).includes(env ?? '')
    ? (env as Locale)
    : DEFAULT_LOCALE;
}

/** translate() bound to the instance's e-mail locale. */
export function emailText(key: TranslationKey, vars?: TranslationVars): string {
  return translate(emailLocale(), key, vars);
}

export async function sendEmailAlert(
  to: string,
  subject: string,
  body: string,
): Promise<boolean> {
  if (!to)
    throw new Error('sendEmailAlert: expected non-empty to address, got ""');
  if (!subject)
    throw new Error('sendEmailAlert: expected non-empty subject, got ""');
  if (!body) throw new Error('sendEmailAlert: expected non-empty body, got ""');

  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const adminEmail = process.env.ADMIN_EMAIL;
  const cc = adminEmail && adminEmail !== to ? adminEmail : undefined;

  try {
    await transport.sendMail({
      from: process.env.GMAIL_USER,
      to,
      cc,
      subject,
      text: body,
    });
    return true;
  } catch (err) {
    logger.error('sendEmailAlert: transport.sendMail failed', { subject }, err);
    return false;
  }
}
