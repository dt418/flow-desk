/**
 * Pure burndown calculator — ideal line + remaining points per day.
 * Unit-tested without DB.
 */

export interface BurndownInput {
  startDate: Date;
  endDate: Date;
  /** Total story points at sprint start */
  totalPoints: number;
  /** Completions: when points were burned (completedAt + estimate) */
  completions: Array<{ completedAt: Date; points: number }>;
  /** Optional "as of" for mid-sprint; defaults to now clamped to end */
  asOf?: Date;
}

export interface BurndownPoint {
  date: string; // YYYY-MM-DD UTC
  remaining: number;
  ideal: number;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export function computeBurndown(input: BurndownInput): BurndownPoint[] {
  const days = eachDay(input.startDate, input.endDate);
  if (days.length === 0) return [];

  const total = Math.max(0, input.totalPoints);
  const n = days.length - 1; // intervals
  const asOf = input.asOf ?? new Date();

  // Sort completions
  const sorted = [...input.completions].sort(
    (a, b) => a.completedAt.getTime() - b.completedAt.getTime(),
  );

  let burned = 0;
  let completionIdx = 0;

  return days.map((day, i) => {
    const key = dayKey(day);
    const dayEnd = new Date(day);
    dayEnd.setUTCHours(23, 59, 59, 999);

    // Only count completions up to asOf and this day
    const cutoff = dayEnd < asOf ? dayEnd : asOf;
    while (completionIdx < sorted.length && sorted[completionIdx]!.completedAt <= cutoff) {
      burned += sorted[completionIdx]!.points;
      completionIdx += 1;
    }

    const ideal = n === 0 ? 0 : total * (1 - i / n);
    const remaining = Math.max(0, total - burned);

    // After asOf day, freeze actual remaining (don't invent future burns)
    const pastOrToday = dayEnd <= asOf || key === dayKey(asOf);

    return {
      date: key,
      remaining: pastOrToday ? remaining : remaining,
      ideal: Math.round(ideal * 100) / 100,
    };
  });
}
