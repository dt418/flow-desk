import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 py-1 text-sm text-[var(--fg)] shadow-sm transition-colors',
        'placeholder:text-[var(--fg-3)]',
        'outline-none focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-red-500/60 aria-invalid:ring-1 aria-invalid:ring-red-500/30',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
