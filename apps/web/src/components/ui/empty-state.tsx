import * as React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-2)]/40 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-3)] text-[var(--fg-3)]">
        <Icon className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-[var(--fg)]">{title}</p>
        {description && (
          <p className="max-w-sm text-[12px] text-[var(--fg-3)]">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
