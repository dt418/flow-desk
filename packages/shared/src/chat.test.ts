import { describe, it, expect } from 'vitest';
import {
  channelScopeSchema,
  createChannelSchema,
  updateChannelSchema,
  createChatMessageSchema,
  updateChatMessageSchema,
  listChannelsQuerySchema,
  listChatMessagesQuerySchema,
} from './chat';

const VALID_CUID = 'cm1234567890abcdefghij'; // 22 chars, within 20-30
const SHORT_ID = 'abc';

describe('channelScopeSchema', () => {
  it('accepts WORKSPACE', () => {
    expect(channelScopeSchema.parse('WORKSPACE')).toBe('WORKSPACE');
  });

  it('accepts TASK', () => {
    expect(channelScopeSchema.parse('TASK')).toBe('TASK');
  });

  it('rejects unknown value', () => {
    expect(() => channelScopeSchema.parse('OTHER')).toThrow();
    expect(() => channelScopeSchema.parse('workspace')).toThrow(); // case-sensitive
  });
});

describe('createChannelSchema', () => {
  const validWorkspaceChannel = {
    workspaceId: VALID_CUID,
    name: 'general',
  };

  it('accepts a valid workspace channel', () => {
    const result = createChannelSchema.parse(validWorkspaceChannel);
    expect(result.workspaceId).toBe(VALID_CUID);
    expect(result.name).toBe('general');
  });

  it('accepts TASK scope with taskId', () => {
    const result = createChannelSchema.parse({
      workspaceId: VALID_CUID,
      name: 'task-chat',
      scope: 'TASK',
      taskId: VALID_CUID,
    });
    expect(result.scope).toBe('TASK');
    expect(result.taskId).toBe(VALID_CUID);
  });

  it('rejects name with invalid characters', () => {
    expect(() =>
      createChannelSchema.parse({ ...validWorkspaceChannel, name: 'has space' })
    ).toThrow();
    expect(() =>
      createChannelSchema.parse({ ...validWorkspaceChannel, name: 'has!bang' })
    ).toThrow();
  });

  it('rejects TASK scope without taskId', () => {
    const result = createChannelSchema.safeParse({
      ...validWorkspaceChannel,
      scope: 'TASK',
    });
    expect(result.success).toBe(false);
  });

  it('defaults isPrivate=false and scope=WORKSPACE', () => {
    const result = createChannelSchema.parse(validWorkspaceChannel);
    expect(result.isPrivate).toBe(false);
    expect(result.scope).toBe('WORKSPACE');
  });

  it('rejects workspaceId that is too short to be a cuid', () => {
    expect(() =>
      createChannelSchema.parse({ ...validWorkspaceChannel, workspaceId: SHORT_ID })
    ).toThrow();
  });
});

describe('updateChannelSchema', () => {
  it('allows partial patches', () => {
    expect(() => updateChannelSchema.parse({ name: 'renamed' })).not.toThrow();
    expect(() =>
      updateChannelSchema.parse({ isPrivate: true })
    ).not.toThrow();
  });

  it('rejects empty patches', () => {
    expect(() => updateChannelSchema.parse({})).toThrow();
  });
});

describe('createChatMessageSchema', () => {
  it('requires non-empty content', () => {
    expect(() =>
      createChatMessageSchema.parse({ channelId: VALID_CUID, content: '' })
    ).toThrow();
  });

  it('accepts up to 20 mentions', () => {
    const mentions = Array.from({ length: 20 }, () => VALID_CUID);
    const result = createChatMessageSchema.parse({
      channelId: VALID_CUID,
      content: 'hi @team',
      mentionedUserIds: mentions,
    });
    expect(result.mentionedUserIds).toHaveLength(20);
  });

  it('rejects more than 20 mentions', () => {
    const mentions = Array.from({ length: 21 }, () => VALID_CUID);
    expect(() =>
      createChatMessageSchema.parse({
        channelId: VALID_CUID,
        content: 'hi',
        mentionedUserIds: mentions,
      })
    ).toThrow();
  });

  it('defaults mentionedUserIds to []', () => {
    const result = createChatMessageSchema.parse({
      channelId: VALID_CUID,
      content: 'hello',
    });
    expect(result.mentionedUserIds).toEqual([]);
  });
});

describe('updateChatMessageSchema', () => {
  it('requires non-empty content', () => {
    expect(() => updateChatMessageSchema.parse({ content: '' })).toThrow();
    expect(() => updateChatMessageSchema.parse({})).toThrow();
  });

  it('accepts valid content', () => {
    expect(() =>
      updateChatMessageSchema.parse({ content: 'edited' })
    ).not.toThrow();
  });
});

describe('listChannelsQuerySchema', () => {
  it('requires workspaceId', () => {
    expect(() => listChannelsQuerySchema.parse({})).toThrow();
  });

  it('allows optional scope', () => {
    expect(() =>
      listChannelsQuerySchema.parse({ workspaceId: VALID_CUID })
    ).not.toThrow();
    expect(() =>
      listChannelsQuerySchema.parse({
        workspaceId: VALID_CUID,
        scope: 'TASK',
      })
    ).not.toThrow();
  });
});

describe('listChatMessagesQuerySchema', () => {
  it('requires channelId', () => {
    expect(() => listChatMessagesQuerySchema.parse({})).toThrow();
  });

  it('accepts channelId with optional cursor/limit', () => {
    expect(() =>
      listChatMessagesQuerySchema.parse({ channelId: VALID_CUID })
    ).not.toThrow();
  });
});
