import { describe, it, expect, vi, afterEach } from 'vitest';

const mockWorkerOn = vi.fn();
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => ({
  Worker: vi.fn(() => ({ on: mockWorkerOn, close: mockWorkerClose })),
}));

vi.mock('../../../shared/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('../../../shared/lib/email-provider', () => ({
  emailProvider: { name: 'nodemailer', send: vi.fn() },
}));

vi.mock('../../../shared/lib/prisma', () => ({
  prisma: {
    emailJob: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'info', NODE_ENV: 'test' },
}));

describe('send processor', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates worker and registers failed listener', async () => {
    await import('./send');
    expect(mockWorkerOn).toHaveBeenCalledWith('failed', expect.any(Function));
  });

  it('worker closes cleanly', async () => {
    const { sendEmailWorker } = await import('./send');
    await sendEmailWorker.close();
    expect(mockWorkerClose).toHaveBeenCalled();
  });
});
