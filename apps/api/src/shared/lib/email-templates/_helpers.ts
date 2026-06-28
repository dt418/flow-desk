export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export function htmlEscape(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}

export function formatDueLine(dueAt: string | null): string {
  if (dueAt === null) return 'No due date';
  const d = new Date(dueAt);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(d) + ' UTC';
}