import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChatMessageWithAuthor,
  CreateChannelInput,
  UpdateChannelInput,
  CreateChatMessageInput,
  UpdateChatMessageInput,
} from './types';
import { chatApi } from './api';
import { useNamespacedSocket } from '@/lib/socket';
import { SOCKET_EVENTS, SOCKET_ROOMS } from '@flow-desk/shared/socket-events';
import { toast } from 'sonner';
import {
  appendChannelToList,
  patchChannelInList,
  removeChannelFromList,
  appendMessageIfNew,
  replaceMessageById,
  removeMessageById,
} from './cache';

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
  return useMutation({
    mutationFn: (body: CreateChatMessageInput) => chatApi.sendMessage(wid, channelId, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: chatKeys.messages(wid, channelId) });
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
      return { clientMessageId: body.clientMessageId };
    },
    onSuccess: (data, _variables, context) => {
      qc.setQueryData(
        chatKeys.messages(wid, channelId),
        (
          old:
            | { pages: Array<{ data: ChatMessageWithAuthor[]; nextCursor: string | null }> }
            | undefined,
        ) => {
          if (!old) return old;
          const cid = context?.clientMessageId;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((m) =>
                cid && 'clientMessageId' in m && m.clientMessageId === cid ? data.data : m,
              ),
            })),
          };
        },
      );
    },
    onError: (_err, _variables, context) => {
      if (context?.clientMessageId) {
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
                  'clientMessageId' in m &&
                  m.clientMessageId === context.clientMessageId
                    ? { ...m, status: 'failed' as const }
                    : m,
                ),
              })),
            };
          },
        );
      }
      toast.error('Failed to send message');
    },
  });
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
        room: SOCKET_ROOMS.conversation(prevChannelRef.current),
      });
    }

    socket.emit(SOCKET_EVENTS.ConversationJoin, {
      room: SOCKET_ROOMS.conversation(activeChannelId),
    });
    prevChannelRef.current = activeChannelId;

    return () => {
      socket.emit(SOCKET_EVENTS.ConversationLeave, {
        room: SOCKET_ROOMS.conversation(activeChannelId),
      });
      prevChannelRef.current = null;
    };
  }, [socket, wid, activeChannelId]);

  useEffect(() => {
    if (!activeChannelId || !wid) return;

    const onNew = (payload: { channelId: string; message: ChatMessageWithAuthor }) => {
      qc.invalidateQueries({ queryKey: chatKeys.channels(wid) });
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

    socket.on('message:new', onNew);
    socket.on('message:updated', onUpdated);
    socket.on('message:deleted', onDeleted);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:updated', onUpdated);
      socket.off('message:deleted', onDeleted);
    };
  }, [socket, wid, activeChannelId, qc]);
}

export function useFlattenedMessages(
  data: { pages: Array<{ data: ChatMessageWithAuthor[] }> } | undefined,
): ChatMessageWithAuthor[] {
  return useMemo(() => {
    if (!data?.pages) return [];
    return [...data.pages].reverse().flatMap((p) => p.data);
  }, [data]);
}
