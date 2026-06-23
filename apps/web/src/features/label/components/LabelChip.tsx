import * as React from 'react';
import { cn } from '@/lib/utils';
import { LABEL_COLOR_HEX, type LabelColor, type Label } from '../types';

export type LabelChipSize = 'sm' | 'md';

interface Props {
  label: Pick<Label, 'id' | 'name' | 'color'>;
  size?: LabelChipSize;
  className?: string;
  onRemove?: () => void;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const v = m[1]!;
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

function srgbToLinear(c: number): number {
  const n = c / 255;
  return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastText(bg: string): string {
  return relativeLuminance(bg) > 0.5 ? '#0a1810' : '#ffffff';
}

export function colorToHex(color: LabelColor | string): string {
  if (color in LABEL_COLOR_HEX) return LABEL_COLOR_HEX[color as LabelColor]!;
  return color;
}

export function LabelChip({ label, size = 'sm', className, onRemove }: Props) {
  const hex = React.useMemo(() => colorToHex(label.color), [label.color]);
  const fg = React.useMemo(() => contrastText(hex), [hex]);
  return (
    <span
      data-label-id={label.id}
      data-label-color={label.color}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 font-medium leading-none transition-colors',
        size === 'sm' ? 'h-5 text-[10px]' : 'h-6 text-[11px]',
        onRemove && 'pr-1',
        className,
      )}
      style={{ backgroundColor: hex, color: fg }}
      title={label.name}
    >
      <span className="truncate">{label.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${label.name}`}
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full transition-colors hover:bg-black/15"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden focusable="false">
            <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}
