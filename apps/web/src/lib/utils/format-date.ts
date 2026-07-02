export function formatDate(value: string | Date | null | undefined, timeZone?: string): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });
}

export function relativeDays(
  value: string | Date | null | undefined,
  timeZone = 'UTC',
): { label: string; tone: 'overdue' | 'today' | 'soon' | 'normal' } | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: `${-days}d late`, tone: 'overdue' };
  if (days === 0) return { label: 'Today', tone: 'today' };
  if (days === 1) return { label: 'Tomorrow', tone: 'today' };
  if (days < 7)
    return {
      label: d.toLocaleDateString(undefined, { weekday: 'short', timeZone }),
      tone: 'soon',
    };
  return { label: formatDate(value, timeZone), tone: 'normal' };
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
