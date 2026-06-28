import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import {
  cleanDatabase,
  createUser,
  createWorkspace,
  addMember,
} from '../setup/factories';
import * as channelSvc from '../../src/modules/chat/chat.service';
import * as messageSvc from '../../src/modules/chat/chat.message.service';
import { prisma as db } from '../../src/shared/lib/prisma';
import { NotFoundError, BadRequestError } from '../../src/shared/errors';

describe('chat integration', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let ownerId: string;
  let memberId: string;
  let wid: string;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    const owner = await createUser(prisma, 'owner@test.com', 'Owner');
    ownerId = owner.id;
    const member = await createUser(prisma, 'member@test.com', 'Member');
    memberId = member.id;
    const w = await createWorkspace(prisma, ownerId, 'ChatTest');
    wid = w.id;
    await addMember(prisma, wid, memberId, 'MEMBER');
  });

  describe('channels', () => {
    it('creates and lists channels', async () => {
      const ch1 = await channelSvc.createChannel(db, ownerId, wid, {
        workspaceId: wid,
        name: 'general',
        isPrivate: false,
        scope: 'WORKSPACE',
      });
      expect(ch1.name).toBe('general');

      const ch2 = await channelSvc.createChannel(db, ownerId, wid, {
        workspaceId: wid,
        name: 'random',
        isPrivate: false,
        scope: 'WORKSPACE',
      });
      expect(ch2.name).toBe('random');

      const channels = await channelSvc.listChannels(db, ownerId, wid);
      expect(channels).toHaveLength(2);
      expect(channels.map((c) => c.name).sort()).toEqual(['general', 'random']);
    });

    it('channel includes latestMessage when messages exist', async () => {
      const ch = await channelSvc.createChannel(db, ownerId, wid, {
        workspaceId: wid,
        name: 'updates',
        isPrivate: false,
        scope: 'WORKSPACE',
      });
      await messageSvc.sendMessage(db, ownerId, ch.id, {
        content: 'First message',
        mentionedUserIds: [],
      });

      const channels = await channelSvc.listChannels(db, ownerId, wid);
      expect(channels).toHaveLength(1);
      expect(channels[0]!.latestMessage).not.toBeNull();
      expect(channels[0]!.latestMessage!.content).toBe('First message');
      expect(channels[0]!.latestMessage!.authorId).toBe(ownerId);
    });

    it('non-member cannot create channel', async () => {
      const outsider = await createUser(prisma, 'outsider@test.com');
      await expect(
        channelSvc.createChannel(db, outsider.id, wid, {
          workspaceId: wid,
          name: 'secret',
          isPrivate: false,
          scope: 'WORKSPACE',
        }),
      ).rejects.toThrow();
    });

    it('updates channel name and description', async () => {
      const ch = await channelSvc.createChannel(db, ownerId, wid, {
        workspaceId: wid,
        name: 'old-name',
        isPrivate: false,
        scope: 'WORKSPACE',
      });
      const updated = await channelSvc.updateChannel(db, ownerId, wid, ch.id, {
        name: 'new-name',
        description: 'Updated description',
      });
      expect(updated.name).toBe('new-name');
      expect(updated.description).toBe('Updated description');
    });

    it('soft-deletes channel', async () => {
      const ch = await channelSvc.createChannel(db, ownerId, wid, {
        workspaceId: wid,
        name: 'temp',
        isPrivate: false,
        scope: 'WORKSPACE',
      });
      await channelSvc.deleteChannel(db, ownerId, wid, ch.id);
      await expect(
        channelSvc.getChannel(db, ownerId, wid, ch.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('messages', () => {
    let channelId: string;

    beforeEach(async () => {
      const ch = await channelSvc.createChannel(db, ownerId, wid, {
        workspaceId: wid,
        name: 'general',
        isPrivate: false,
        scope: 'WORKSPACE',
      });
      channelId = ch.id;
    });

    it('sends and lists messages in chronological order', async () => {
      await messageSvc.sendMessage(db, ownerId, channelId, {
        content: 'First',
        mentionedUserIds: [],
      });
      await messageSvc.sendMessage(db, memberId, channelId, {
        content: 'Second',
        mentionedUserIds: [],
      });

      const result = await messageSvc.listMessages(db, ownerId, channelId, {
        channelId,
        limit: 50,
      });
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.content).toBe('First');
      expect(result.data[1]!.content).toBe('Second');
      expect(result.data[0]!.authorId).toBe(ownerId);
      expect(result.data[1]!.authorId).toBe(memberId);
    });

    it('cursor pagination returns correct page', async () => {
      for (let i = 0; i < 5; i++) {
        await messageSvc.sendMessage(db, ownerId, channelId, {
          content: `Message ${i}`,
          mentionedUserIds: [],
        });
        await new Promise((r) => setTimeout(r, 5));
      }

      let total = 0;
      let cursor: string | undefined;
      const pages: string[][] = [];
      for (let i = 0; i < 5; i++) {
        const result = await messageSvc.listMessages(db, ownerId, channelId, {
          channelId,
          limit: 2,
          cursor,
        });
        total += result.data.length;
        pages.push(result.data.map((m) => m.content));
        cursor = result.nextCursor ?? undefined;
        if (!cursor) break;
      }

      expect(total).toBe(5);
      expect(pages.length).toBe(3);
      expect(pages[0]!.length).toBe(2);
      expect(pages[1]!.length).toBe(2);
      expect(pages[2]!.length).toBe(1);
    });

    it('author can edit own message', async () => {
      const msg = await messageSvc.sendMessage(db, ownerId, channelId, {
        content: 'Original',
        mentionedUserIds: [],
      });
      const updated = await messageSvc.updateMessage(db, ownerId, channelId, msg.id, {
        content: 'Edited',
      });
      expect(updated.content).toBe('Edited');
    });

    it('non-author cannot edit message', async () => {
      const msg = await messageSvc.sendMessage(db, ownerId, channelId, {
        content: 'Original',
        mentionedUserIds: [],
      });
      await expect(
        messageSvc.updateMessage(db, memberId, channelId, msg.id, {
          content: 'Hacked',
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it('author can delete own message', async () => {
      const msg = await messageSvc.sendMessage(db, ownerId, channelId, {
        content: 'Delete me',
        mentionedUserIds: [],
      });
      await messageSvc.deleteMessage(db, ownerId, channelId, msg.id);
      // After soft-delete, message should not appear in list
      const result = await messageSvc.listMessages(db, ownerId, channelId, {
        channelId,
        limit: 50,
      });
      expect(result.data).toHaveLength(0);
    });

    it('message includes author info', async () => {
      const msg = await messageSvc.sendMessage(db, ownerId, channelId, {
        content: 'With author',
        mentionedUserIds: [],
      });
      const result = await messageSvc.listMessages(db, ownerId, channelId, {
        channelId,
        limit: 50,
      });
      expect(result.data[0]!.author.id).toBe(ownerId);
      expect(result.data[0]!.author.name).toBe('Owner');
      expect(result.data[0]!.author.email).toBe('owner@test.com');
    });
  });
});
