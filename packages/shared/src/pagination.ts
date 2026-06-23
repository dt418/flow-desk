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

export interface DecodedCursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}_${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(value: string): DecodedCursor | null {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const idx = decoded.indexOf('_');
    if (idx <= 0) return null;
    const createdAtStr = decoded.slice(0, idx);
    const id = decoded.slice(idx + 1);
    if (!id) return null;
    const createdAt = new Date(createdAtStr);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
