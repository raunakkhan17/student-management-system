import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { prisma } from '@/config/prisma';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.isEmailEnabled) return null;

  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });

  return transporter;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  templateId?: string;
}

/**
 * Queues and sends an email, recording the attempt in `email_logs`.
 *
 * When SMTP is not configured the message is logged rather than sent, so local
 * development never blocks on mail delivery. Delivery failures never propagate
 * — an unsent notification must not fail the request that triggered it.
 */
export async function sendEmail({ to, subject, html, templateId }: SendEmailInput): Promise<boolean> {
  const log = await prisma.emailLog.create({
    data: { recipient: to, subject, templateId: templateId ?? null, status: 'QUEUED' },
  });

  const mailer = getTransporter();

  if (!mailer) {
    logger.info('Email suppressed (SMTP not configured)', { to, subject });
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', error: 'SMTP is not configured' },
    });
    return false;
  }

  try {
    await mailer.sendMail({ from: env.MAIL_FROM, to, subject, html });
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to send email', { to, subject, error: message });
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', error: message },
    });
    return false;
  }
}

/** Renders `{{token}}`-style placeholders in a stored template body. */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => variables[key] ?? match);
}

/** Loads a template by key and renders it, or returns null when inactive/missing. */
export async function renderStoredTemplate(
  key: string,
  variables: Record<string, string>,
): Promise<{ id: string; subject: string; html: string } | null> {
  const template = await prisma.emailTemplate.findFirst({ where: { key, isActive: true } });
  if (!template) return null;

  return {
    id: template.id,
    subject: renderTemplate(template.subject, variables),
    html: renderTemplate(template.bodyHtml, variables),
  };
}
