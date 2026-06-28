import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
const mockWorkerOn = vi.fn();
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockEmailJobCreate = vi.fn();
const mockEmailJobUpdateMany = vi.fn();

vi.mock('bullmq', () => ({
  Queue: vi.fn(() => ({ add: mockQueueAdd })),
  Worker: vi.fn(() => ({ on: mockWorkerOn, close: mockWorkerClose })),
}));

vi.mock('../../../shared/lib/env', () => ({
  env: { REDIS_URL: 'redis://localhost:6379' },
}));

vi.mock('../../../shared/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn() },
}));

vi.mock('../../../shared/lib/email-provider', () => ({
  emailProvider: { name: 'nodemailer', send: vi.fn() },
}));

vi.mock('../../../shared/lib/prisma', () => ({
  prisma: {
    emailJob: {
      updateMany: mockEmailJobUpdateMany.mockResolvedValue({ count: 1 }),
      create: mockEmailJobCreate.mockResolvedValue({ id: 'ej-1' }),
    },
  },
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'info', NODE_ENV: 'test' },
}));

vi.mock('../../shared/lib/prisma', () => ({
  prisma: {
    emailJob: {
      updateMany: mockEmailJobUpdateMany.mockResolvedValue({ count: 1 }),
      create: mockEmailJobCreate.mockResolvedValue({ id: 'ej-1' }),
    },
  },
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'info', NODE_ENV: 'test' },
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

  describe('scheduleDelayed', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('creates EmailJob in DB then enqueues with delay', async () => {
      const { scheduleDelayed } = await import('./schedule-delayed');
      await scheduleDelayed(
        'user-1',
        'test@example.com',
        { subject: 'Delayed', html: '<p>Hi</p>' },
        5000,
      );
      expect(mockEmailJobCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            type: 'DELAYED',
            status: 'PENDING',
          }),
        }),
      );
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'send',
        expect.objectContaining({ type: 'DELAYED' }),
        expect.objectContaining({ delay: 5000 }),
      );
    });

    it('uses jobId prefix for delayed jobs', async () => {
      const { scheduleDelayed } = await import('./schedule-delayed');
      await scheduleDelayed(
        'user-1',
        'test@example.com',
        { subject: 'Delayed', html: '<p>Hi</p>' },
        5000,
      );
      const createCall = mockEmailJobCreate.mock.calls[0]![0];
      const jobId = (createCall.data as { id: string }).id;
      expect(jobId.startsWith('delayed-user-1-')).toBe(true);
    });

    it('cancelDelayed updates status to CANCELLED', async () => {
      const { cancelDelayed } = await import('./schedule-delayed');
      await cancelDelayed('user-1', 'delayed-user-1-123');
      expect(mockEmailJobUpdateMany).toHaveBeenCalledWith({
        where: {
          id: 'delayed-user-1-123',
          userId: 'user-1',
          type: 'DELAYED',
          status: 'PENDING',
        },
        data: { status: 'CANCELLED' },
      });
    });
  });
});
