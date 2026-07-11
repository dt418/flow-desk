import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { requireAuth } from '../../shared/middleware/auth';
import { automationService } from './automation.service';
import {
  createAutomationRuleSchema,
  updateAutomationRuleSchema,
  automationRuleSchema,
  automationRuleListSchema,
  ruleExecutionSchema,
} from '@flow-desk/shared/automation';

export const automationRouter = new Hono();
automationRouter.use('*', requireAuth());

automationRouter.get('/', async (c) => {
  const wid = c.req.param('wid')!;
  const auth = c.get('auth');
  const data = await automationService.list(auth.user.id, wid);
  return c.json(automationRuleListSchema.parse({ data }));
});

automationRouter.post(
  '/',
  zValidator('json', createAutomationRuleSchema, (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const wid = c.req.param('wid')!;
    const auth = c.get('auth');
    const body = c.req.valid('json');
    const result = await automationService.create(auth.user.id, wid, body);
    return c.json(automationRuleSchema.parse(result), 201);
  },
);

automationRouter.patch(
  '/:id',
  zValidator('json', updateAutomationRuleSchema, (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const result = await automationService.update(auth.user.id, id, body);
    return c.json(automationRuleSchema.parse(result));
  },
);

automationRouter.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  await automationService.remove(auth.user.id, id);
  return c.json({ ok: true });
});

automationRouter.get('/:id/executions', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const data = await automationService.listExecutions(auth.user.id, id);
  return c.json({ data: data.map((d) => ruleExecutionSchema.parse(d)) });
});
