'use client';

import * as React from 'react';
import { format } from 'date-fns';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';

interface DatePickerProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Optional id forwarded to the trigger button for a11y. */
  id?: string;
  /** Min date (inclusive). */
  minDate?: Date;
  /** Max date (inclusive). */
  maxDate?: Date;
}

function toDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toDateInputValue(d: Date | undefined): string {
  if (!d) return '';
  // YYYY-MM-DD in local timezone
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled,
  className,
  id,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const selected = toDate(value);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isDateDisabled = React.useCallback(
    (d: Date) => {
      if (minDate) {
        const min = new Date(minDate);
        min.setHours(0, 0, 0, 0);
        if (d < min) return true;
      }
      if (maxDate) {
        const max = new Date(maxDate);
        max.setHours(23, 59, 59, 999);
        if (d > max) return true;
      }
      return false;
    },
    [minDate, maxDate],
  );

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Button
        id={id}
        type="button"
        variant="outline"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={selected ? `Due date, ${format(selected, 'PPP')}` : 'Due date'}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'h-9 w-full justify-start px-3 font-normal',
          !selected && 'text-muted-foreground',
        )}
      >
        <CalendarIcon className="size-4" />
        <span>{selected ? format(selected, 'PPP') : placeholder}</span>
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Pick a date"
          className="absolute right-0 top-[calc(100%+4px)] z-[100] rounded-lg border border-border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d: Date | undefined) => {
              onChange(d ? toDateInputValue(d) : null);
              setOpen(false);
            }}
            disabled={isDateDisabled}
          />
          <div className="flex items-center justify-between border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onChange(toDateInputValue(new Date()));
                setOpen(false);
              }}
            >
              Today
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

// Re-export helpers in case callers need them.
export { toDate, toDateInputValue };
