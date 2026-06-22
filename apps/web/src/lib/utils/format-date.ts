export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export function relativeDays(
  value: string | Date | null | undefined,
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
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      tone: 'soon',
    };
  return { label: formatDate(value), tone: 'normal' };
}
