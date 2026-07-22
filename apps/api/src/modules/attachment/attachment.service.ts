import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import type { ListAttachmentsQuery } from '@flow-desk/shared/attachment';
import { createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { assertCanWriteWorkspace, assertMembership } from '../../shared/lib/access';
import { env } from '../../shared/lib/prisma';
import { decodeCursor, encodeCursor } from '@flow-desk/shared/pagination';
import * as repo from './attachment.repository';

/** Per-user rolling 24h upload cap (RISKS R-06). */
export const DAILY_UPLOAD_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GiB

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  // .svg intentionally omitted — XSS if served/rendered as image/svg+xml
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.json',
  '.zip',
  '.tar',
  '.gz',
  '.mp3',
  '.mp4',
  '.wav',
  '.webm',
]);

const SAFE_INLINE_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

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

/** Content-Type for download: only known raster images keep their mime. */
export function downloadContentType(mimeType: string): string {
  if (SAFE_INLINE_IMAGE_MIMES.has(mimeType)) return mimeType;
  return 'application/octet-stream';
}

export async function listAttachments(
  prisma: PrismaClient,
  userId: string,
  query: ListAttachmentsQuery,
) {
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

async function bytesUploadedInLastDay(prisma: PrismaClient, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const agg = await prisma.attachment.aggregate({
    where: { uploadedById: userId, createdAt: { gte: since } },
    _sum: { size: true },
  });
  return agg._sum.size ?? 0;
}

/** Stream file to disk with a hard size cap; unlink on failure. */
export async function streamUploadToDisk(
  file: File,
  destPath: string,
  maxBytes: number,
): Promise<number> {
  const writeStream = createWriteStream(destPath);
  const webStream = file.stream();
  const nodeStream = Readable.fromWeb(
    webStream as import('node:stream/web').ReadableStream<Uint8Array>,
  );
  let written = 0;
  nodeStream.on('data', (chunk: Buffer | string) => {
    const n = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
    written += n;
    if (written > maxBytes) {
      nodeStream.destroy(Object.assign(new Error('TOO_LARGE'), { code: 'TOO_LARGE' }));
    }
  });
  try {
    await pipeline(nodeStream, writeStream);
  } catch (err) {
    await unlink(destPath).catch(() => undefined);
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'TOO_LARGE'
    ) {
      throw new BadRequestError(`File exceeds ${maxBytes} bytes`);
    }
    throw err;
  }
  return written;
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
  // GUEST may list/download but not upload
  await assertCanWriteWorkspace(task.workspaceId, userId);

  const used = await bytesUploadedInLastDay(prisma, userId);
  if (used + file.size > DAILY_UPLOAD_QUOTA_BYTES) {
    throw new BadRequestError(
      `Daily upload quota exceeded (${DAILY_UPLOAD_QUOTA_BYTES} bytes / 24h)`,
      { code: 'UPLOAD_QUOTA', used, quota: DAILY_UPLOAD_QUOTA_BYTES },
    );
  }

  await mkdir(env.UPLOAD_DIR, { recursive: true });
  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new BadRequestError(`File extension "${ext}" is not allowed`);
  }
  const stored = `${randomUUID()}${ext}`;
  const path = join(env.UPLOAD_DIR, stored);
  const size = await streamUploadToDisk(file, path, env.MAX_UPLOAD_SIZE);

  return repo.create(prisma, {
    taskId,
    uploadedById: userId,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    size,
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
