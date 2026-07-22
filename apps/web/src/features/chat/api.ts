import { api } from '@/lib/api';
import type {
  ChannelView,
  ChannelWithLatest,
  ChatMessageWithAuthor,
  CreateChannelInput,
  UpdateChannelInput,
  CreateChatMessageInput,
  UpdateChatMessageInput,
  ChannelMember,
} from './types';

export const chatApi = {
  listChannels(wid: string) {
    return api<{ data: ChannelWithLatest[] }>(
      `/api/workspaces/${encodeURIComponent(wid)}/channels`,
    );
  },

  createChannel(wid: string, body: CreateChannelInput) {
    return api<{ data: ChannelView }>(`/api/workspaces/${encodeURIComponent(wid)}/channels`, {
      method: 'POST',
      json: body,
    });
  },

  updateChannel(wid: string, id: string, body: UpdateChannelInput) {
    return api<{ data: ChannelView }>(
      `/api/workspaces/${encodeURIComponent(wid)}/channels/${encodeURIComponent(id)}`,
      { method: 'PATCH', json: body },
    );
  },

  deleteChannel(wid: string, id: string) {
    return api<{ ok: boolean }>(
      `/api/workspaces/${encodeURIComponent(wid)}/channels/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  },

  listChannelMembers(wid: string, channelId: string) {
    return api<{ data: ChannelMember[] }>(
      `/api/workspaces/${encodeURIComponent(wid)}/channels/${encodeURIComponent(channelId)}/members`,
    );
  },

  addChannelMember(wid: string, channelId: string, userId: string) {
    return api<{ ok: boolean; channelId: string; userId: string }>(
      `/api/workspaces/${encodeURIComponent(wid)}/channels/${encodeURIComponent(channelId)}/members`,
      { method: 'POST', json: { userId } },
    );
  },

  removeChannelMember(wid: string, channelId: string, userId: string) {
    return api<{ ok: boolean }>(
      `/api/workspaces/${encodeURIComponent(wid)}/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    );
  },

  listMessages(wid: string, channelId: string, cursor?: string) {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    return api<{ data: ChatMessageWithAuthor[]; nextCursor: string | null }>(
      `/api/workspaces/${encodeURIComponent(wid)}/channels/${encodeURIComponent(channelId)}/messages?${params}`,
    );
  },

  sendMessage(wid: string, channelId: string, body: CreateChatMessageInput) {
    return api<{ data: ChatMessageWithAuthor }>(
      `/api/workspaces/${encodeURIComponent(wid)}/channels/${encodeURIComponent(channelId)}/messages`,
      { method: 'POST', json: body },
    );
  },

  updateMessage(wid: string, channelId: string, messageId: string, body: UpdateChatMessageInput) {
    return api<{ data: ChatMessageWithAuthor }>(
      `/api/workspaces/${encodeURIComponent(wid)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
      { method: 'PATCH', json: body },
    );
  },

  deleteMessage(wid: string, channelId: string, messageId: string) {
    return api<{ ok: boolean }>(
      `/api/workspaces/${encodeURIComponent(wid)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
      { method: 'DELETE' },
    );
  },

  getTaskChannel(taskId: string) {
    return api<{ data: ChannelView }>(`/api/tasks/${encodeURIComponent(taskId)}/task-channel`, {
      method: 'POST',
    });
  },
};
