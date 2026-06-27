import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn() },
}));

vi.mock('resend', () => ({
  Resend: vi.fn(),
}));

import nodemailer from 'nodemailer';
import { Resend } from 'resend';

const createTransport = vi.mocked(nodemailer.createTransport);
const ResendCtor = vi.mocked(Resend);

async function loadProviderModule(provider?: 'nodemailer' | 'resend') {
  if (provider) {
    process.env.EMAIL_PROVIDER = provider;
  } else {
    delete process.env.EMAIL_PROVIDER;
  }
  vi.resetModules();
  return import('./email-provider');
}

describe('email-provider', () => {
  afterEach(() => {
    delete process.env.EMAIL_PROVIDER;
    vi.clearAllMocks();
  });

  describe('NodemailerEmailProvider', () => {
    let sendMail: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      sendMail = vi.fn();
      createTransport.mockReturnValue({ sendMail } as never);
    });

    it('calls transporter.sendMail and returns messageId + provider id', async () => {
      sendMail.mockResolvedValue({ messageId: '<abc@mail>' });
      const { buildEmailProvider } = await loadProviderModule('nodemailer');
      const provider = buildEmailProvider();

      const result = await provider.send({
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
      });

      expect(result).toEqual({ messageId: '<abc@mail>', provider: 'nodemailer' });
      expect(sendMail).toHaveBeenCalledTimes(1);
      const call = sendMail.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call).toMatchObject({
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
      });
    });

    it('joins array to with commas', async () => {
      sendMail.mockResolvedValue({ messageId: 'm1' });
      const { buildEmailProvider } = await loadProviderModule('nodemailer');
      const provider = buildEmailProvider();

      await provider.send({
        to: ['a@example.com', 'b@example.com'],
        subject: 'S',
        html: 'h',
      });

      const call = sendMail.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call?.to).toBe('a@example.com,b@example.com');
    });

    it('throws AppError(502 EMAIL_UPSTREAM) when transporter rejects', async () => {
      sendMail.mockRejectedValue(new Error('smtp connection refused'));
      const { buildEmailProvider } = await loadProviderModule('nodemailer');
      const provider = buildEmailProvider();

      await expect(
        provider.send({ to: 'x@y.com', subject: 's', html: 'h' }),
      ).rejects.toMatchObject({
        status: 502,
        code: 'EMAIL_UPSTREAM',
        message: expect.stringContaining('smtp'),
      });
    });
  });

  describe('ResendEmailProvider', () => {
    let send: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      send = vi.fn();
      ResendCtor.mockImplementation(
        () => ({ emails: { send } }) as unknown as InstanceType<typeof Resend>,
      );
    });

    it('calls client.emails.send and returns messageId + provider id', async () => {
      send.mockResolvedValue({ data: { id: 'resend-1' }, error: null });
      const { buildEmailProvider } = await loadProviderModule('resend');
      const provider = buildEmailProvider();

      const result = await provider.send({
        to: 'user@example.com',
        subject: 'Hi',
        html: '<p>Hi</p>',
      });

      expect(result).toEqual({ messageId: 'resend-1', provider: 'resend' });
      expect(send).toHaveBeenCalledTimes(1);
      const call = send.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call).toMatchObject({
        to: ['user@example.com'],
        subject: 'Hi',
        html: '<p>Hi</p>',
      });
    });

    it('passes array to as array', async () => {
      send.mockResolvedValue({ data: { id: 'r' }, error: null });
      const { buildEmailProvider } = await loadProviderModule('resend');
      const provider = buildEmailProvider();

      await provider.send({
        to: ['a@example.com', 'b@example.com'],
        subject: 'S',
        html: 'h',
      });

      const call = send.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call?.to).toEqual(['a@example.com', 'b@example.com']);
    });

    it('throws AppError(502 EMAIL_UPSTREAM) when resend returns error', async () => {
      send.mockResolvedValue({ data: null, error: { message: 'bad domain' } });
      const { buildEmailProvider } = await loadProviderModule('resend');
      const provider = buildEmailProvider();

      await expect(
        provider.send({ to: 'x@y.com', subject: 's', html: 'h' }),
      ).rejects.toMatchObject({
        status: 502,
        code: 'EMAIL_UPSTREAM',
        message: expect.stringContaining('resend'),
      });
    });
  });

  describe('buildEmailProvider factory', () => {
    it('returns nodemailer provider when EMAIL_PROVIDER is unset (default)', async () => {
      delete process.env.EMAIL_PROVIDER;
      vi.resetModules();
      const { buildEmailProvider } = await import('./email-provider');
      expect(buildEmailProvider().name).toBe('nodemailer');
    });

    it('returns nodemailer provider when EMAIL_PROVIDER=nodemailer', async () => {
      process.env.EMAIL_PROVIDER = 'nodemailer';
      vi.resetModules();
      const { buildEmailProvider } = await import('./email-provider');
      expect(buildEmailProvider().name).toBe('nodemailer');
    });

    it('returns resend provider when EMAIL_PROVIDER=resend', async () => {
      process.env.EMAIL_PROVIDER = 'resend';
      vi.resetModules();
      const { buildEmailProvider } = await import('./email-provider');
      expect(buildEmailProvider().name).toBe('resend');
    });
  });
});