import { useEffect, useMemo } from 'react';
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
import { toast } from 'sonner';

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.channels(wid) });
    },
  });
}

export function useUpdateChannel(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateChannelInput }) =>
      chatApi.updateChannel(wid, id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.channels(wid) });
    },
  });
}

export function useDeleteChannel(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chatApi.deleteChannel(wid, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.channels(wid) });
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
      qc.invalidateQueries({ queryKey: chatKeys.channels(wid) });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.messages(wid, channelId) });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.messages(wid, channelId) });
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

  useEffect(() => {
    if (!activeChannelId || !wid) return;

    const onNew = (payload: { channelId: string; message: ChatMessageWithAuthor }) => {
      qc.invalidateQueries({ queryKey: chatKeys.channels(wid) });
      if (payload.channelId !== activeChannelId) return;
      qc.setQueryData(
        chatKeys.messages(wid, activeChannelId),
        (
          old:
            | { pages: Array<{ data: ChatMessageWithAuthor[]; nextCursor: string | null }> }
            | undefined,
        ) => {
          if (!old) return old;
          const serverMsg = payload.message;
          const cid =
            'clientMessageId' in serverMsg ? (serverMsg as { clientMessageId?: string }).clientMessageId : undefined;
          if (cid) {
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                data: page.data.map((m) =>
                  'clientMessageId' in m && m.clientMessageId === cid ? serverMsg : m,
                ),
              })),
            };
          }
          const pages = [...old.pages];
          if (pages.length > 0) {
            const first = { ...pages[0]! };
            pages[0] = { ...first, data: [...first.data, serverMsg] };
          }
          return { ...old, pages };
        },
      );
    };

    const onUpdated = (payload: { channelId: string; message: ChatMessageWithAuthor }) => {
      if (payload.channelId !== activeChannelId) return;
      qc.setQueryData(
        chatKeys.messages(wid, activeChannelId),
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
              data: page.data.map((m) => (m.id === payload.message.id ? payload.message : m)),
            })),
          };
        },
      );
    };

    const onDeleted = (payload: { channelId: string; messageId: string }) => {
      if (payload.channelId !== activeChannelId) return;
      qc.setQueryData(
        chatKeys.messages(wid, activeChannelId),
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
              data: page.data.filter((m) => m.id !== payload.messageId),
            })),
          };
        },
      );
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
