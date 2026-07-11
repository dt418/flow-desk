import { describe, it, expect } from 'vitest';
import { nextRunAt } from './cron-next';

describe('nextRunAt (P3-2)', () => {
  it('daily advances one day to 09:00 UTC', () => {
    const from = new Date('2026-07-06T12:00:00Z'); // Monday
    const next = nextRunAt('daily', from);
    expect(next.toISOString()).toBe('2026-07-07T09:00:00.000Z');
  });

  it('weekly lands on next Monday 09:00', () => {
    const from = new Date('2026-07-08T12:00:00Z'); // Wednesday
    const next = nextRunAt('weekly', from);
    expect(next.getUTCDay()).toBe(1);
    expect(next.getUTCHours()).toBe(9);
  });

  it('parses "0 9 * * 1" (Mon 09:00)', () => {
    const from = new Date('2026-07-06T10:00:00Z'); // Mon after 9
    const next = nextRunAt('0 9 * * 1', from);
    expect(next.getUTCDay()).toBe(1);
    expect(next.getUTCHours()).toBe(9);
    expect(next.getUTCMinutes()).toBe(0);
    // should be next week's Monday
    expect(next > from).toBe(true);
  });
});
