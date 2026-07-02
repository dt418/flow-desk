import { cn } from '@/lib/utils';

export const PRIORITY_BAR: Record<string, string> = {
  LOW: 'bg-slate-300 dark:bg-slate-600',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
};

export const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
};

export const STATUS_TONE: Record<string, string> = {
  BACKLOG: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  TODO: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  IN_PROGRESS: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  IN_REVIEW: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  DONE: 'bg-primary/10 text-primary',
  BLOCKED: 'bg-red-500/10 text-red-600 dark:text-red-300',
};

export function shortId(id: string): string {
  return id.slice(-4).toUpperCase();
}

export function relativeDate(
  value: string | null,
): { label: string; tone: 'overdue' | 'soon' | 'normal' } | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return { label: 'Today', tone: 'soon' };
  if (days === 1) return { label: 'Tomorrow', tone: 'soon' };
  if (days === -1) return { label: 'Yesterday', tone: 'overdue' };
  if (days > 1 && days < 7)
    return { label: d.toLocaleDateString(undefined, { weekday: 'short' }), tone: 'normal' };
  if (days < 0) return { label: `${-days}d late`, tone: 'overdue' };
  return { label: `+${days}d`, tone: 'normal' };
}

export function PriorityDot({ priority }: { priority: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[priority] ?? 'bg-muted-foreground')} />
      {priority}
    </span>
  );
}
