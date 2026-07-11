import { describe, it, expect } from 'vitest';
import { buildMonthGrid, buildWeekGrid, dueDateKey, startOfMonth } from './date-grid';

describe('calendar date-grid (P3-3)', () => {
  it('buildMonthGrid returns 42 cells', () => {
    const anchor = new Date('2026-07-15T12:00:00Z');
    const today = new Date('2026-07-11T12:00:00Z');
    const grid = buildMonthGrid(anchor, today);
    expect(grid).toHaveLength(42);
    expect(grid.some((c) => c.isToday)).toBe(true);
    expect(grid.filter((c) => c.inMonth).length).toBeGreaterThanOrEqual(28);
  });

  it('buildWeekGrid returns 7 days starting Sunday', () => {
    const anchor = new Date('2026-07-08T12:00:00Z'); // Wednesday
    const week = buildWeekGrid(anchor);
    expect(week).toHaveLength(7);
    expect(week[0]!.date.getUTCDay()).toBe(0);
  });

  it('dueDateKey normalizes ISO strings', () => {
    expect(dueDateKey('2026-07-11T15:30:00.000Z')).toBe('2026-07-11');
    expect(dueDateKey(null)).toBeNull();
  });

  it('startOfMonth is day 1 UTC', () => {
    const s = startOfMonth(new Date('2026-07-15T23:00:00Z'));
    expect(s.getUTCDate()).toBe(1);
    expect(s.getUTCMonth()).toBe(6);
  });
});
