import { z } from 'zod';

// GET: { data: SavedFilter[] } — schema already validated by the route
// (savedFilterListResponseSchema). Re-import from @flow-desk/shared directly.
// We only need the okSchema for DELETE locally.

export const okSchema = z.object({ ok: z.boolean() });
export type OkResponse = z.infer<typeof okSchema>;
