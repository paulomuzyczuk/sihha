import nodemailer from 'nodemailer';
import { logger } from './logger';

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
