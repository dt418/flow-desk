import { describe, it, expect, vi, afterEach } from 'vitest';

const mockWorkerOn = vi.fn();
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => ({
  Worker: vi.fn(() => ({ on: mockWorkerOn, close: mockWorkerClose })),
}));

vi.mock('../../../shared/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../shared/lib/email-provider', () => ({
  emailProvider: {
    name: 'nodemailer',
    send: vi.fn().mockResolvedValue({ messageId: 'msg-123', provider: 'nodemailer' }),
  },
}));

vi.mock('../../../shared/lib/prisma', () => ({
  prisma: {
    emailJob: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

describe('delayed processor', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delayedEmailWorker registers failed event listener', async () => {
    await import('./delayed');
    expect(mockWorkerOn).toHaveBeenCalledWith('failed', expect.any(Function));
  });

  it('delayedEmailWorker closes cleanly', async () => {
    const { delayedEmailWorker } = await import('./delayed');
    await delayedEmailWorker.close();
    expect(mockWorkerClose).toHaveBeenCalled();
  });
});
