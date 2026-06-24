import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import type { ListAttachmentsQuery } from '@flow-desk/shared/attachment';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { assertMembership } from '../../shared/lib/access';
import { env } from '../../shared/lib/prisma';
import { decodeCursor, encodeCursor } from '@flow-desk/shared/pagination';
import * as repo from './attachment.repository';

export type AttachmentKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER';

export function classifyMime(mime: string): AttachmentKind {
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

export async function listAttachments(prisma: PrismaClient, userId: string, query: ListAttachmentsQuery) {
  if (!query.taskId) throw new BadRequestError('taskId required');
  const task = await repo.findTaskWorkspace(prisma, query.taskId);
  if (!task) throw new NotFoundError('Task not found');
  await assertMembership(task.workspaceId, userId);

  const decoded = query.cursor ? decodeCursor(query.cursor) : null;
  const cursorWhere = decoded
    ? {
        OR: [
          { createdAt: { lt: decoded.createdAt } },
          { createdAt: decoded.createdAt, id: { lt: decoded.id } },
        ],
      }
    : undefined;
  const items = await prisma.attachment.findMany({
    where: { taskId: query.taskId, ...(cursorWhere ?? {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });
  const hasMore = items.length > query.limit;
  const data = hasMore ? items.slice(0, query.limit) : items;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
  return { data, nextCursor };
}

export async function uploadAttachment(
  prisma: PrismaClient,
  userId: string,
  taskId: string,
  file: File,
) {
  if (!(file instanceof File)) throw new BadRequestError('file is required');
  if (!taskId) throw new BadRequestError('taskId is required');
  if (file.size > env.MAX_UPLOAD_SIZE) {
    throw new BadRequestError(`File exceeds ${env.MAX_UPLOAD_SIZE} bytes`);
  }
  const task = await prisma.task.findUnique({ where: { id: taskId, deletedAt: null } });
  if (!task) throw new NotFoundError('Task not found');
  await assertMembership(task.workspaceId, userId);

  await mkdir(env.UPLOAD_DIR, { recursive: true });
  const ext = extname(file.name) || '';
  const stored = `${randomUUID()}${ext}`;
  const path = join(env.UPLOAD_DIR, stored);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path, buf);

  return repo.create(prisma, {
    taskId,
    uploadedById: userId,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    type: classifyMime(file.type || ''),
    storagePath: path,
  });
}

export async function getDownloadAttachment(prisma: PrismaClient, userId: string, id: string) {
  const attachment = await repo.findById(prisma, id);
  if (!attachment) throw new NotFoundError('Attachment not found');
  const task = await prisma.task.findUnique({
    where: { id: attachment.taskId, deletedAt: null },
    select: { workspaceId: true },
  });
  if (!task) throw new NotFoundError('Task not found');
  await assertMembership(task.workspaceId, userId);

  let fileStat;
  try {
    fileStat = await stat(attachment.storagePath);
  } catch {
    throw new NotFoundError('File missing on disk');
  }
  const stream = createReadStream(attachment.storagePath);
  return { attachment, fileStat, stream };
}