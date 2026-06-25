import * as React from 'react';
import { ListTodo, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyBoardStateProps {
  /** When true, suppress the CTA (used when modal opens). */
  ctaDisabled?: boolean;
  /** Click handler for the "Create your first task" CTA. */
  onCreate: () => void;
}

/**
 * Rendered when `tasks.length === 0` in a workspace.
 * Full-bleed centered illustration + CTA that opens the task create modal.
 */
export function EmptyBoardState({ ctaDisabled = false, onCreate }: EmptyBoardStateProps) {
  return (
    <div className="flex h-full flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="relative mb-6 flex h-32 w-32 items-center justify-center">
          <span aria-hidden className="absolute inset-0 rounded-full bg-emerald-500/10 blur-2xl" />
          <span
            aria-hidden
            className="absolute inset-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-2)]/80 shadow-sm"
          />
          <ListTodo className="relative h-12 w-12 text-emerald-500" aria-hidden />
          <span
            aria-hidden
            className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-emerald-500 shadow ring-4 ring-[var(--bg)]"
          />
        </div>

        <h2 className="text-[18px] font-semibold tracking-tight">No tasks yet</h2>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--fg-2)]">
          Start by creating one — give it a title, pick a column, and you&apos;re set.
        </p>

        <Button
          type="button"
          onClick={onCreate}
          disabled={ctaDisabled}
          className="mt-6 h-9 bg-emerald-500 px-4 text-white hover:bg-emerald-600"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Create your first task
        </Button>
      </div>
    </div>
  );
}
