import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CursorPaginationQuery } from '@flow-desk/shared/pagination';
import { cuidSchema } from '@flow-desk/shared/common';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';
import { BadRequestError } from '../../shared/errors';
import * as svc from './attachment.service';

const listAttachmentsQuerySchema = CursorPaginationQuery.extend({ taskId: cuidSchema });

export const attachmentRouter = new Hono();
attachmentRouter.use('*', requireAuth());

attachmentRouter.get(
  '/',
  zValidator('query', listAttachmentsQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_QUERY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const query = c.req.valid('query');
    const result = await svc.listAttachments(prisma, auth.user.id, query);
    return c.json({ data: result.data, nextCursor: result.nextCursor });
  },
);

attachmentRouter.post('/', async (c) => {
  const auth = c.get('auth');
  const formData = await c.req.formData();
  const file = formData.get('file');
  const taskId = formData.get('taskId');
  if (!(file instanceof File)) throw new BadRequestError('file is required');
  if (typeof taskId !== 'string') throw new BadRequestError('taskId is required');
  const attachment = await svc.uploadAttachment(prisma, auth.user.id, taskId, file);
  return c.json({ attachment }, 201);
});

attachmentRouter.get('/:id/download', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  const { attachment, fileStat, stream } = await svc.getDownloadAttachment(prisma, auth.user.id, id);
  c.header('Content-Type', attachment.mimeType);
  c.header('Content-Length', String(fileStat.size));
  c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.filename)}"`);
  return c.body(stream as unknown as ReadableStream);
});