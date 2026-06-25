import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import {
  cleanDatabase,
  createUser,
  createWorkspace,
  addMember,
  createColumn,
  createTask,
} from '../setup/factories';
import * as svc from '../../src/modules/attachment/attachment.service';
import { prisma as db } from '../../src/shared/lib/prisma';
import { BadRequestError, NotFoundError } from '../../src/shared/errors';

describe('attachment.service', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let ownerId: string, memberId: string, outsiderId: string;
  let wid: string, taskId: string;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    const owner = await createUser(prisma, 'owner@test.com');
    const member = await createUser(prisma, 'member@test.com');
    const outsider = await createUser(prisma, 'outsider@test.com');
    ownerId = owner.id;
    memberId = member.id;
    outsiderId = outsider.id;
    const w = await createWorkspace(prisma, owner.id);
    wid = w.id;
    await addMember(prisma, wid, member.id, 'MEMBER');
    const col = await createColumn(prisma, wid);
    const t = await createTask(prisma, wid, col.id, owner.id);
    taskId = t.id;
  });

  describe('classifyMime', () => {
    it('images', () => expect(svc.classifyMime('image/png')).toBe('IMAGE'));
    it('documents', () => expect(svc.classifyMime('application/pdf')).toBe('DOCUMENT'));
    it('audio/video', () => {
      expect(svc.classifyMime('audio/mp3')).toBe('AUDIO');
      expect(svc.classifyMime('video/mp4')).toBe('VIDEO');
    });
    it('OTHER fallback', () => expect(svc.classifyMime('application/octet-stream')).toBe('OTHER'));
  });

  describe('listAttachments', () => {
    it('lists by task (cursor)', async () => {
      await prisma.attachment.create({
        data: {
          taskId,
          uploadedById: ownerId,
          filename: 'a.txt',
          mimeType: 'text/plain',
          size: 10,
          type: 'DOCUMENT',
          storagePath: '/tmp/x',
        },
      });
      const res = await svc.listAttachments(db, ownerId, { taskId, limit: 10 } as never);
      expect(res.data).toHaveLength(1);
    });

    it('missing taskId (400)', async () => {
      await expect(
        svc.listAttachments(db, ownerId, { taskId: '', limit: 10 } as never),
      ).rejects.toThrow(BadRequestError);
    });

    it('missing task (404)', async () => {
      await expect(
        svc.listAttachments(db, ownerId, { taskId: 'nope', limit: 10 } as never),
      ).rejects.toThrow(NotFoundError);
    });

    it('non-member rejected', async () => {
      await expect(
        svc.listAttachments(db, outsiderId, { taskId, limit: 10 } as never),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('uploadAttachment', () => {
    it('happy', async () => {
      const file = new File(['hello'], 'a.txt', { type: 'text/plain' });
      const att = await svc.uploadAttachment(db, ownerId, taskId, file);
      expect(att.filename).toBe('a.txt');
      expect(att.type).toBe('DOCUMENT');
      expect(att.size).toBe(5);
    });

    it('non-member rejected', async () => {
      const file = new File(['x'], 'a.txt', { type: 'text/plain' });
      await expect(svc.uploadAttachment(db, outsiderId, taskId, file)).rejects.toThrow(
        BadRequestError,
      );
    });

    it('missing task (404)', async () => {
      const file = new File(['x'], 'a.txt', { type: 'text/plain' });
      await expect(svc.uploadAttachment(db, ownerId, 'missing', file)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('getDownloadAttachment', () => {
    it('happy', async () => {
      const file = new File(['content'], 'a.txt', { type: 'text/plain' });
      const att = await svc.uploadAttachment(db, ownerId, taskId, file);
      const result = await svc.getDownloadAttachment(db, ownerId, att.id);
      expect(result.attachment.filename).toBe('a.txt');
      expect(result.fileStat.size).toBe(7);
      result.stream.destroy?.();
    });

    it('missing (404)', async () => {
      await expect(svc.getDownloadAttachment(db, ownerId, 'missing')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('non-member rejected', async () => {
      const file = new File(['x'], 'a.txt', { type: 'text/plain' });
      const att = await svc.uploadAttachment(db, ownerId, taskId, file);
      await expect(svc.getDownloadAttachment(db, outsiderId, att.id)).rejects.toThrow(
        BadRequestError,
      );
    });
  });
});
