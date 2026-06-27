import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
const mockWorkerOn = vi.fn();
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => ({
  Queue: vi.fn(() => ({ add: mockQueueAdd })),
  Worker: vi.fn(() => ({ on: mockWorkerOn, close: mockWorkerClose })),
}));

vi.mock('../../../shared/lib/env', () => ({
  env: { REDIS_URL: 'redis://localhost:6379' },
}));

vi.mock('../../../shared/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../shared/lib/email-provider', () => ({
  emailProvider: { name: 'nodemailer', send: vi.fn() },
}));

vi.mock('../../../shared/lib/prisma', () => ({
  prisma: { emailJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } },
}));

import { Queue, Worker } from 'bullmq';

describe('email worker', () => {
  describe('queue', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('enqueueEmail adds job with correct data and type INSTANT', async () => {
      const { enqueueEmail } = await import('./queue');
      const data = {
        userId: 'user-1',
        type: 'INSTANT' as const,
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      };
      await enqueueEmail(data);
      expect(mockQueueAdd).toHaveBeenCalledWith('send', data, {
        delay: undefined,
        jobId: undefined,
      });
    });

    it('enqueueEmail passes delay option', async () => {
      const { enqueueEmail } = await import('./queue');
      const data = {
        userId: 'user-1',
        type: 'DELAYED' as const,
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      };
      await enqueueEmail(data, { delay: 5000 });
      expect(mockQueueAdd).toHaveBeenCalledWith('send', data, {
        delay: 5000,
        jobId: undefined,
      });
    });

    it('enqueueEmail passes jobId option', async () => {
      const { enqueueEmail } = await import('./queue');
      const data = {
        userId: 'user-1',
        type: 'INSTANT' as const,
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      };
      await enqueueEmail(data, { jobId: 'custom-job-id' });
      expect(mockQueueAdd).toHaveBeenCalledWith('send', data, {
        delay: undefined,
        jobId: 'custom-job-id',
      });
    });
  });

  describe('instant processor', () => {
    it('instantEmailWorker registers failed event listener', async () => {
      await import('./processors/instant');
      expect(mockWorkerOn).toHaveBeenCalledWith('failed', expect.any(Function));
    });

    it('instantEmailWorker closes cleanly', async () => {
      const { instantEmailWorker } = await import('./processors/instant');
      await instantEmailWorker.close();
      expect(mockWorkerClose).toHaveBeenCalled();
    });
  });
});
