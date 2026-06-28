import { env } from './env';
import { logger } from './logger';
import { AppError } from '../errors';
import nodemailer, { type Transporter } from 'nodemailer';
import { Resend } from 'resend';

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface EmailSendResult {
  messageId: string;
  provider: string;
}

export interface EmailProvider {
  readonly name: string;
  send(payload: EmailPayload): Promise<EmailSendResult>;
}

class NodemailerEmailProvider implements EmailProvider {
  readonly name = 'nodemailer';
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT!,
      secure: env.SMTP_SECURE,
      auth:
        env.SMTP_USER && env.SMTP_PASSWORD
          ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
          : undefined,
    });
  }

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: payload.from ?? env.EMAIL_FROM,
        to: Array.isArray(payload.to) ? payload.to.join(',') : payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        replyTo: payload.replyTo,
        headers: payload.headers,
      });
      return { messageId: info.messageId, provider: this.name };
    } catch (err) {
      logger.error({ err }, 'nodemailer send failed');
      throw new AppError(502, 'Email send failed (smtp)', 'EMAIL_UPSTREAM', {
        provider: this.name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  private client: Resend;

  constructor() {
    this.client = new Resend(env.RESEND_API_KEY!);
  }

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    try {
      const { data, error } = await this.client.emails.send({
        from: payload.from ?? env.EMAIL_FROM!,
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        replyTo: payload.replyTo as string | undefined,
        headers: payload.headers,
      });
      if (error || !data) {
        throw new AppError(502, 'Email send failed (resend)', 'EMAIL_UPSTREAM', {
          provider: this.name,
          error,
        });
      }
      return { messageId: data.id, provider: this.name };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err }, 'resend send failed');
      throw new AppError(502, 'Email send failed (resend)', 'EMAIL_UPSTREAM', {
        provider: this.name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function buildEmailProvider(): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case 'resend':
      return new ResendEmailProvider();
    case 'nodemailer':
    default:
      return new NodemailerEmailProvider();
  }
}

export const emailProvider: EmailProvider = buildEmailProvider();