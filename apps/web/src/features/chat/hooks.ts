import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChannelView,
  ChannelWithLatest,
  ChatMessageWithAuthor,
  CreateChannelInput,
  UpdateChannelInput,
  CreateChatMessageInput,
  UpdateChatMessageInput,
} from './types';
import { chatApi } from './api';
import { useNamespacedSocket, getSocket as getNamespacedSocket } from '@/lib/socket';
import { SOCKET_EVENTS } from '@flow-desk/shared';
import { toast } from 'sonner';
import {
  appendChannelToList,
  patchChannelInList,
  removeChannelFromList,
  appendMessageIfNew,
  replaceMessageById,
  removeMessageById,
} from './cache';

export type ReadReceipt = { userId: string; messageId: string; readAt: string };
const readReceiptsState = new Map<string, ReadReceipt[]>();

function getReadReceipts(channelId: string): ReadReceipt[] {
  return readReceiptsState.get(channelId) ?? [];
}

function addReadReceipt(channelId: string, receipt: ReadReceipt) {
  const arr = readReceiptsState.get(channelId) ?? [];
  const existing = arr.find(
    (r) => r.userId === receipt.userId && r.messageId === receipt.messageId,
  );
  if (!existing) {
    arr.push(receipt);
    readReceiptsState.set(channelId, arr);
  }
}

export const chatKeys = {
  channels: (wid: string) => ['channels', wid] as const,
  messages: (wid: string, channelId: string) => ['channels', wid, 'messages', channelId] as const,
};

export function useChannels(wid: string) {
  return useQuery({
    queryKey: chatKeys.channels(wid),
    queryFn: () => chatApi.listChannels(wid),
    enabled: Boolean(wid),
  });
}

export function useCreateChannel(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateChannelInput) => chatApi.createChannel(wid, body),
    onSuccess: (data) => {
      appendChannelToList(qc, wid, data.data);
    },
  });
}

export function useUpdateChannel(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateChannelInput }) =>
      chatApi.updateChannel(wid, id, body),
    onSuccess: (data, variables) => {
      patchChannelInList(qc, wid, variables.id, variables.body);
    },
  });
}

export function useDeleteChannel(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chatApi.deleteChannel(wid, id),
    onSuccess: (_data, id) => {
      removeChannelFromList(qc, wid, id);
    },
  });
}

export function useMessages(wid: string, channelId: string) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(wid, channelId),
    queryFn: ({ pageParam }) => chatApi.listMessages(wid, channelId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(wid && channelId),
  });
}

export function useSendMessage(
  wid: string,
  channelId: string,
  user: { id: string; name: string; email: string; avatarUrl: string | null },
) {
  const qc = useQueryClient();
  useNamespacedSocket('/collab');
  const [isPending, setIsPending] = useState(false);

  const optimisticInsert = (body: CreateChatMessageInput) => {
    const optimistic: ChatMessageWithAuthor & { clientMessageId: string; status: 'sending' } = {
      id: `temp-${body.clientMessageId}`,
      channelId,
      authorId: user.id,
      content: body.content,
      mentionedUserIds: body.mentionedUserIds ?? [],
      clientMessageId: body.clientMessageId,
      editedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
      status: 'sending',
    };
    qc.setQueryData(
      chatKeys.messages(wid, channelId),
      (
        old:
          | { pages: Array<{ data: ChatMessageWithAuthor[]; nextCursor: string | null }> }
          | undefined,
      ) => {
        if (!old) return old;
        const pages = [...old.pages];
        if (pages.length > 0) {
          const first = { ...pages[0]! };
          pages[0] = { ...first, data: [...first.data, optimistic] };
        }
        return { ...old, pages };
      },
    );
    return body.clientMessageId;
  };

  const replaceWithServer = (clientMessageId: string, message: ChatMessageWithAuthor) => {
    qc.setQueryData(
      chatKeys.messages(wid, channelId),
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
            data: page.data.map((m) =>
              'clientMessageId' in m && m.clientMessageId === clientMessageId ? message : m,
            ),
          })),
        };
      },
    );
  };

  const markFailed = (clientMessageId: string) => {
    qc.setQueryData(
      chatKeys.messages(wid, channelId),
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
            data: page.data.map((m) =>
              'clientMessageId' in m && m.clientMessageId === clientMessageId
                ? { ...m, status: 'failed' as const }
                : m,
            ),
          })),
        };
      },
    );
  };

  const ackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mutate = (body: CreateChatMessageInput) => {
    // Always resolve the live socket here — the per-namespace cache may swap
    // the underlying connection on stuck-reconnect (see socket.ts:getSocket).
    // Reusing a stale socket reference silently drops the ack.
    const socket = getNamespacedSocket('/collab');

    if (!socket.connected) {
      toast.error('Chat is offline. Reconnecting…');
      return;
    }

    setIsPending(true);
    const clientMessageId = optimisticInsert(body);

    if (ackTimeoutRef.current) clearTimeout(ackTimeoutRef.current);
    ackTimeoutRef.current = setTimeout(() => {
      markFailed(clientMessageId);
      setIsPending(false);
      toast.error('Message delivery timed out');
    }, 5000);

    // Non-volatile: socket.volatile.emit drops the packet when the polling
    // transport isn't momentarily writable (frequent with polling), silently
    // losing messages. We already bail above when !socket.connected, so a
    // plain emit when connected is correct — it queues through the engine.
    socket.emit(
      'message:send',
      {
        channelId,
        content: body.content,
        clientMessageId: body.clientMessageId,
        mentionedUserIds: body.mentionedUserIds ?? [],
      },
      (response: { ok: boolean; message?: ChatMessageWithAuthor; error?: string }) => {
        if (ackTimeoutRef.current) clearTimeout(ackTimeoutRef.current);
        if (response.ok && response.message) {
          replaceWithServer(clientMessageId, response.message);
        } else {
          markFailed(clientMessageId);
          toast.error(response.error ?? 'Failed to send message');
        }
        setIsPending(false);
      },
    );
  };

  return { mutate, isPending };
}

export function useUpdateMessage(wid: string, channelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: UpdateChatMessageInput }) =>
      chatApi.updateMessage(wid, channelId, messageId, body),
    onSuccess: (data) => {
      replaceMessageById(qc, wid, channelId, data.data.id, data.data);
    },
    onError: () => {
      toast.error('Failed to update message');
    },
  });
}

export function useDeleteMessage(wid: string, channelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => chatApi.deleteMessage(wid, channelId, messageId),
    onSuccess: (_data, messageId) => {
      removeMessageById(qc, wid, channelId, messageId);
    },
    onError: () => {
      toast.error('Failed to delete message');
    },
  });
}

export function useChatPresence(activeChannelId: string | null) {
  const [viewers, setViewers] = useState<string[]>([]);
  const { socket } = useNamespacedSocket('/collab');

  useEffect(() => {
    if (!activeChannelId) {
      setViewers([]);
      return;
    }

    const onPresenceUpdate = (payload: { channelId: string; viewers: string[] }) => {
      if (payload.channelId === activeChannelId) {
        setViewers(payload.viewers);
      }
    };

    socket.on('presence:update', onPresenceUpdate);
    return () => {
      socket.off('presence:update', onPresenceUpdate);
    };
  }, [socket, activeChannelId]);

  return viewers;
}

export function useChatRealtime(wid: string, activeChannelId: string | null) {
  const qc = useQueryClient();
  const { socket } = useNamespacedSocket('/collab');

  useEffect(() => {
    if (!wid) return;
    const join = () => socket.emit('join-workspace', { workspaceId: wid });
    join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit('leave-workspace', { workspaceId: wid });
    };
  }, [socket, wid]);

  const prevChannelRef = useRef<string | null>(activeChannelId);

  useEffect(() => {
    if (!activeChannelId || !wid) return;

    if (prevChannelRef.current && prevChannelRef.current !== activeChannelId) {
      socket.emit(SOCKET_EVENTS.ConversationLeave, {
        channelId: prevChannelRef.current,
      });
    }

    socket.emit(SOCKET_EVENTS.ConversationJoin, {
      channelId: activeChannelId,
    });
    prevChannelRef.current = activeChannelId;

    return () => {
      socket.emit(SOCKET_EVENTS.ConversationLeave, {
        channelId: activeChannelId,
      });
      prevChannelRef.current = null;
    };
  }, [socket, wid, activeChannelId]);

  useEffect(() => {
    if (!activeChannelId || !wid) return;

    const onNew = (payload: { channelId: string; message: ChatMessageWithAuthor }) => {
      // Update the channel's latestMessage in the channels list cache
      // directly instead of invalidating — the realtime event already
      // carries the data we need to refresh the preview, so a refetch
      // is wasted bandwidth.
      qc.setQueryData<{ data: ChannelWithLatest[]; nextCursor: string | null } | undefined>(
        chatKeys.channels(wid),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((c) =>
              c.id === payload.channelId
                ? {
                    ...c,
                    latestMessage: {
                      id: payload.message.id,
                      authorId: payload.message.authorId,
                      content: payload.message.content,
                      createdAt: payload.message.createdAt,
                    },
                  }
                : c,
            ),
          };
        },
      );
      if (payload.channelId !== activeChannelId) return;
      appendMessageIfNew(qc, wid, activeChannelId, payload.message);
    };

    const onUpdated = (payload: { channelId: string; message: ChatMessageWithAuthor }) => {
      if (payload.channelId !== activeChannelId) return;
      replaceMessageById(qc, wid, activeChannelId, payload.message.id, payload.message);
    };

    const onDeleted = (payload: { channelId: string; messageId: string }) => {
      if (payload.channelId !== activeChannelId) return;
      removeMessageById(qc, wid, activeChannelId, payload.messageId);
    };

    const onRead = (payload: {
      userId: string;
      channelId: string;
      messageId: string;
      readAt: string;
    }) => {
      if (payload.channelId !== activeChannelId) return;
      addReadReceipt(activeChannelId, payload);
    };

    socket.on('message:new', onNew);
    socket.on('message:updated', onUpdated);
    socket.on('message:deleted', onDeleted);
    socket.on('message:read', onRead);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:updated', onUpdated);
      socket.off('message:deleted', onDeleted);
      socket.off('message:read', onRead);
    };
  }, [socket, wid, activeChannelId, qc]);

  useEffect(() => {
    if (!wid) return;

    const onConversationUpdated = (payload: {
      type: 'created' | 'updated' | 'deleted';
      channel?: { id: string; name: string; description: string | null; [key: string]: unknown };
      channelId?: string;
    }) => {
      if (payload.type === 'created' && payload.channel) {
        appendChannelToList(qc, wid, payload.channel as ChannelView);
      } else if (payload.type === 'updated' && payload.channel) {
        patchChannelInList(qc, wid, payload.channel.id, payload.channel);
      } else if (payload.type === 'deleted' && payload.channelId) {
        removeChannelFromList(qc, wid, payload.channelId);
      }
    };

    socket.on('conversation:updated', onConversationUpdated);
    return () => {
      socket.off('conversation:updated', onConversationUpdated);
    };
  }, [socket, wid, qc]);
}

export function useFlattenedMessages(
  data: { pages: Array<{ data: ChatMessageWithAuthor[] }> } | undefined,
): ChatMessageWithAuthor[] {
  return useMemo(() => {
    if (!data?.pages) return [];
    return [...data.pages].reverse().flatMap((p) => p.data);
  }, [data]);
}

export function useReadReceipts(channelId: string | null) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!channelId) return;
    const interval = setInterval(() => forceUpdate((n) => n + 1), 2000);
    return () => clearInterval(interval);
  }, [channelId]);

  // No useMemo — the underlying Map mutates when message:read arrives,
  // and the 2s forceUpdate above triggers a re-render to read it.
  // A useMemo keyed on channelId would cache the initial empty array.
  return channelId ? getReadReceipts(channelId) : [];
}

// Auto-mark the latest non-own message in the active channel as read.
// Emits message:read exactly once per message id; the server broadcasts
// the receipt back to the room so the author sees "Read by N".
export function useAutoMarkRead(
  wid: string,
  channelId: string | null,
  currentUserId: string | null,
) {
  const { socket } = useNamespacedSocket('/collab');
  const lastEmittedRef = useRef<string | null>(null);
  const messages = useMessages(wid, channelId ?? '');

  useEffect(() => {
    if (!channelId || !currentUserId || !socket.connected) return;
    const pages = messages.data?.pages ?? [];
    if (pages.length === 0) return;
    const flat = [...pages].reverse().flatMap((p) => p.data);
    if (flat.length === 0) return;
    const latest = flat[flat.length - 1];
    // Skip optimistic placeholders (temp id) — the real message arrives
    // via the message:new broadcast and triggers another effect tick.
    if (latest.id.startsWith('temp-')) return;
    if (latest.authorId === currentUserId) return;
    if (lastEmittedRef.current === latest.id) return;
    lastEmittedRef.current = latest.id;
    socket.emit(SOCKET_EVENTS.MessageRead, {
      workspaceId: wid,
      channelId,
      messageId: latest.id,
    });
  }, [wid, channelId, currentUserId, socket, messages.data]);
}
