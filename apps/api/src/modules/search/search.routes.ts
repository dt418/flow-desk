import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { searchQuerySchema, searchResponseSchema } from '@flow-desk/shared/search';
import { requireAuth } from '../../shared/middleware/auth';
import { searchService } from './search.service';

export const searchRouter = new Hono();
searchRouter.use('*', requireAuth());

searchRouter.get(
  '/',
  zValidator('query', searchQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_QUERY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const query = c.req.valid('query');
    const result = await searchService.search(auth.user.id, query);
    return c.json(searchResponseSchema.parse(result));
  },
);
