import { describe, it, expect } from 'vitest';
import { computeBurndown } from './burndown';

describe('computeBurndown (P3-1)', () => {
  it('ideal line goes from total to 0 across the sprint', () => {
    const start = new Date('2026-07-01T00:00:00Z');
    const end = new Date('2026-07-05T00:00:00Z'); // 5 days → 4 intervals
    const points = computeBurndown({
      startDate: start,
      endDate: end,
      totalPoints: 20,
      completions: [],
      asOf: new Date('2026-07-01T12:00:00Z'),
    });
    expect(points).toHaveLength(5);
    expect(points[0]!.ideal).toBe(20);
    expect(points[points.length - 1]!.ideal).toBe(0);
    expect(points[0]!.remaining).toBe(20);
  });

  it('remaining drops when completions land', () => {
    const start = new Date('2026-07-01T00:00:00Z');
    const end = new Date('2026-07-04T00:00:00Z');
    const points = computeBurndown({
      startDate: start,
      endDate: end,
      totalPoints: 21,
      completions: [
        { completedAt: new Date('2026-07-02T10:00:00Z'), points: 5 },
        { completedAt: new Date('2026-07-03T10:00:00Z'), points: 8 },
      ],
      asOf: new Date('2026-07-04T00:00:00Z'),
    });
    // Day 0 (Jul1): 21, Day1 (Jul2): 16, Day2 (Jul3): 8, Day3 (Jul4): 8
    expect(points[0]!.remaining).toBe(21);
    expect(points[1]!.remaining).toBe(16);
    expect(points[2]!.remaining).toBe(8);
  });
});
