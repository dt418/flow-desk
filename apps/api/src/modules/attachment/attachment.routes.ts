import { Hono } from 'hono';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';
import { env } from '../../shared/lib/env';
import { BadRequestError, NotFoundError } from '../../shared/errors';

export const attachmentRouter = new Hono();
attachmentRouter.use('*', requireAuth());

function classifyMime(mime: string): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER' {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (
    mime === 'application/pdf' ||
    mime.includes('word') ||
    mime.includes('sheet') ||
    mime.includes('presentation') ||
    mime.startsWith('text/')
  )
    return 'DOCUMENT';
  return 'OTHER';
}

attachmentRouter.get('/', async (c) => {
  const taskId = c.req.query('taskId');
  if (!taskId) throw new BadRequestError('taskId required');
  const attachments = await prisma.attachment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
  });
  return c.json({ attachments });
});

attachmentRouter.post('/', async (c) => {
  const auth = c.get('auth');
  const formData = await c.req.formData();
  const file = formData.get('file');
  const taskId = formData.get('taskId');
  if (!(file instanceof File)) throw new BadRequestError('file is required');
  if (typeof taskId !== 'string') throw new BadRequestError('taskId is required');
  if (file.size > env.MAX_UPLOAD_SIZE) {
    throw new BadRequestError(`File exceeds ${env.MAX_UPLOAD_SIZE} bytes`);
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new NotFoundError('Task not found');

  await mkdir(env.UPLOAD_DIR, { recursive: true });
  const ext = extname(file.name) || '';
  const stored = `${randomUUID()}${ext}`;
  const path = join(env.UPLOAD_DIR, stored);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path, buf);

  const attachment = await prisma.attachment.create({
    data: {
      taskId,
      uploadedById: auth.user.id,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      type: classifyMime(file.type || ''),
      storagePath: path,
    },
  });

  return c.json({ attachment }, 201);
});

attachmentRouter.get('/:id/download', async (c) => {
  const id = c.req.param('id')!;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) throw new NotFoundError('Attachment not found');

  let fileStat;
  try {
    fileStat = await stat(attachment.storagePath);
  } catch {
    throw new NotFoundError('File missing on disk');
  }
  c.header('Content-Type', attachment.mimeType);
  c.header('Content-Length', String(fileStat.size));
  c.header(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
  );
  const stream = createReadStream(attachment.storagePath);
  return c.body(stream as unknown as ReadableStream);
});
