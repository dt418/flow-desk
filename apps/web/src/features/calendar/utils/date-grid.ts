/**
 * Pure calendar grid helpers — month cells for a given anchor date.
 */

export interface CalendarDay {
  date: Date;
  iso: string; // YYYY-MM-DD
  inMonth: boolean;
  isToday: boolean;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** 6×7 grid starting on Sunday, covering the month of `anchor`. */
export function buildMonthGrid(anchor: Date, today: Date = new Date()): CalendarDay[] {
  const first = startOfMonth(anchor);
  const startOffset = first.getUTCDay(); // 0=Sun
  const gridStart = addDays(first, -startOffset);
  const todayIso = isoDay(today);
  const month = first.getUTCMonth();
  const cells: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(gridStart, i);
    cells.push({
      date,
      iso: isoDay(date),
      inMonth: date.getUTCMonth() === month,
      isToday: isoDay(date) === todayIso,
    });
  }
  return cells;
}

/** 7 days starting Sunday of the week containing `anchor`. */
export function buildWeekGrid(anchor: Date, today: Date = new Date()): CalendarDay[] {
  const start = addDays(anchor, -anchor.getUTCDay());
  start.setUTCHours(0, 0, 0, 0);
  const todayIso = isoDay(today);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return {
      date,
      iso: isoDay(date),
      inMonth: true,
      isToday: isoDay(date) === todayIso,
    };
  });
}

export function dueDateKey(dueDate: string | Date | null | undefined): string | null {
  if (!dueDate) return null;
  const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  if (Number.isNaN(d.getTime())) return null;
  return isoDay(d);
}
