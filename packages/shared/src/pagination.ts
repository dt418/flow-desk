import { z } from 'zod';

export const CursorPaginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type CursorPaginationQuery = z.infer<typeof CursorPaginationQuery>;

export const CursorPaginationEnvelope = z.object({
  data: z.array(z.unknown()),
  nextCursor: z.string().nullable(),
});
export type CursorPaginationEnvelope = z.infer<typeof CursorPaginationEnvelope>;

export interface EncodedCursor {
  sortValue: unknown;
  createdAt: Date;
  id: string;
}

export interface DecodedCursor {
  sortValue: unknown;
  createdAt: Date;
  id: string;
}

function toStorage(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  return v;
}

function fromStorage(v: unknown): unknown {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(v)) return new Date(v);
  return v;
}

export function encodeCursor(input: EncodedCursor): string;
export function encodeCursor(createdAt: Date, id: string): string;
export function encodeCursor(arg1: EncodedCursor | Date, arg2?: string): string {
  let payload: Record<string, unknown>;
  if (arg1 instanceof Date && typeof arg2 === 'string') {
    payload = { v: arg1.toISOString(), c: arg1.toISOString(), i: arg2 };
  } else {
    const input = arg1 as EncodedCursor;
    payload = { v: toStorage(input.sortValue), c: input.createdAt.toISOString(), i: input.id };
  }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(value: string): DecodedCursor | null {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.c === 'string' &&
      typeof parsed.i === 'string'
    ) {
      const createdAt = new Date(parsed.c);
      if (Number.isNaN(createdAt.getTime())) return null;
      return { sortValue: fromStorage(parsed.v), createdAt, id: parsed.i };
    }
    return null;
  } catch {
    return null;
  }
}
