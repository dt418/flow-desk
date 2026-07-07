import { type QueryClient } from '@tanstack/react-query';
import { chatKeys } from './hooks';
import type { ChannelView, ChannelWithLatest, ChatMessageWithAuthor } from './types';

function toChannelWithLatest(channel: ChannelView): ChannelWithLatest {
  return { ...channel, latestMessage: null };
}

type ChannelsCache = { data: ChannelWithLatest[] };

export function patchChannelInList(
  qc: QueryClient,
  workspaceId: string,
  channelId: string,
  patch: Partial<Pick<ChannelWithLatest, 'name' | 'description'>>,
) {
  qc.setQueryData(chatKeys.channels(workspaceId), (old: ChannelsCache | undefined) => {
    if (!old) return old;
    return {
      ...old,
      data: old.data.map((ch) => (ch.id === channelId ? { ...ch, ...patch } : ch)),
    };
  });
}

export function appendChannelToList(qc: QueryClient, workspaceId: string, channel: ChannelView) {
  qc.setQueryData(chatKeys.channels(workspaceId), (old: ChannelsCache | undefined) => {
    if (!old) return { data: [toChannelWithLatest(channel)] };
    // ponytail: dedupe by id — server can fan-out the same 'created'
    // event to the same client multiple times when the author is in the
    // room and the broadcast hits two paths.
    if (old.data.some((ch) => ch.id === channel.id)) return old;
    return { ...old, data: [...old.data, toChannelWithLatest(channel)] };
  });
}

export function removeChannelFromList(qc: QueryClient, workspaceId: string, channelId: string) {
  qc.setQueryData(chatKeys.channels(workspaceId), (old: ChannelsCache | undefined) => {
    if (!old) return old;
    return { ...old, data: old.data.filter((ch) => ch.id !== channelId) };
  });
}

export function appendMessageIfNew(
  qc: QueryClient,
  workspaceId: string,
  channelId: string,
  message: ChatMessageWithAuthor,
) {
  qc.setQueryData(
    chatKeys.messages(workspaceId, channelId),
    (
      old:
        | { pages: Array<{ data: ChatMessageWithAuthor[]; nextCursor: string | null }> }
        | undefined,
    ) => {
      if (!old) return old;
      const cid =
        'clientMessageId' in message
          ? (message as { clientMessageId?: string }).clientMessageId
          : undefined;
      const exists = old.pages.some((page) =>
        page.data.some(
          (m) =>
            m.id === message.id || (cid && 'clientMessageId' in m && m.clientMessageId === cid),
        ),
      );
      if (exists) return old;
      const pages = [...old.pages];
      if (pages.length > 0) {
        const first = { ...pages[0]! };
        pages[0] = { ...first, data: [...first.data, message] };
      }
      return { ...old, pages };
    },
  );
}

export function replaceMessageById(
  qc: QueryClient,
  workspaceId: string,
  channelId: string,
  messageId: string,
  replacement: ChatMessageWithAuthor,
) {
  qc.setQueryData(
    chatKeys.messages(workspaceId, channelId),
    (
      old:
        | { pages: Array<{ data: ChatMessageWithAuthor[]; nextCursor: string | null }> }
        | undefined,
    ) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: page.data.map((m) => (m.id === messageId ? replacement : m)),
        })),
      };
    },
  );
}

export function removeMessageById(
  qc: QueryClient,
  workspaceId: string,
  channelId: string,
  messageId: string,
) {
  qc.setQueryData(
    chatKeys.messages(workspaceId, channelId),
    (
      old:
        | { pages: Array<{ data: ChatMessageWithAuthor[]; nextCursor: string | null }> }
        | undefined,
    ) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: page.data.filter((m) => m.id !== messageId),
        })),
      };
    },
  );
}

export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
