import type { Label as SharedLabel, LabelColor } from '@flow-desk/shared';

export type Label = SharedLabel;
export type { LabelColor };
export type LabelColorName = LabelColor;
export type CreateLabelInput = { name: string; color: LabelColor };
export type UpdateLabelInput = { name?: string; color?: LabelColor };

export const LABEL_COLOR_HEX: Record<LabelColor, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#10b981',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
  gray: '#64748b',
};

export const LABEL_COLOR_ORDER: ReadonlyArray<LabelColor> = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'gray',
];

export const LABEL_COLOR_LABEL: Record<LabelColor, string> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
  gray: 'Gray',
};
