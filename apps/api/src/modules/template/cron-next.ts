/**
 * Minimal next-run calculator for recurring task templates.
 * Supports: "daily", "weekly", and "m h * * d" (minute hour * * dow) where dow 0=Sun…6=Sat.
 * Pure — unit tested.
 */

export function nextRunAt(cron: string, from: Date = new Date()): Date {
  const alias = cron.trim().toLowerCase();
  if (alias === 'daily') {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(9, 0, 0, 0);
    return d;
  }
  if (alias === 'weekly') {
    const d = new Date(from);
    // next Monday 09:00 UTC
    const day = d.getUTCDay(); // 0 Sun
    const daysUntilMon = (1 - day + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + daysUntilMon);
    d.setUTCHours(9, 0, 0, 0);
    return d;
  }

  // minute hour * * dow
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Unsupported cron expression: ${cron}`);
  }
  const minute = parseInt(parts[0]!, 10);
  const hour = parseInt(parts[1]!, 10);
  const dow = parts[4] === '*' ? null : parseInt(parts[4]!, 10);
  if (Number.isNaN(minute) || Number.isNaN(hour)) {
    throw new Error(`Unsupported cron expression: ${cron}`);
  }

  const candidate = new Date(from);
  candidate.setUTCSeconds(0, 0);
  // start searching from next minute
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  for (let i = 0; i < 60 * 24 * 14; i++) {
    if (
      candidate.getUTCMinutes() === minute &&
      candidate.getUTCHours() === hour &&
      (dow === null || candidate.getUTCDay() === dow)
    ) {
      return new Date(candidate);
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  throw new Error(`Could not find next run for cron: ${cron}`);
}
