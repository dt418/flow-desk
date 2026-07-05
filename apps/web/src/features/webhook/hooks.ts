import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
  Webhook,
  WebhookWithSecret,
  WebhookDelivery,
} from '@flow-desk/shared/webhook';

// --- Queries ---

export function useWebhooks(workspaceId: string) {
  return useQuery({
    queryKey: ['webhooks', workspaceId],
    queryFn: async () => {
      const res = await api<{ data: Webhook[] }>(`/workspaces/${workspaceId}/webhooks`);
      return res.data;
    },
  });
}

export function useWebhook(workspaceId: string, id: string) {
  return useQuery({
    queryKey: ['webhook', workspaceId, id],
    queryFn: async () => {
      const res = await api<WebhookWithSecret>(`/workspaces/${workspaceId}/webhooks/${id}`);
      return res;
    },
  });
}

export function useWebhookDeliveries(workspaceId: string, webhookId: string, cursor?: string) {
  return useQuery({
    queryKey: ['webhookDeliveries', workspaceId, webhookId, cursor],
    queryFn: async () => {
      const url = cursor
        ? `/workspaces/${workspaceId}/webhooks/${webhookId}/deliveries?cursor=${encodeURIComponent(cursor)}`
        : `/workspaces/${workspaceId}/webhooks/${webhookId}/deliveries`;
      const res = await api<{ data: WebhookDelivery[]; nextCursor: string | null }>(url);
      return {
        data: res.data,
        nextCursor: res.nextCursor,
      };
    },
  });
}

// --- Mutations ---

export function useCreateWebhook(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWebhookInput) => {
      const res = await api<WebhookWithSecret>(`/workspaces/${workspaceId}/webhooks`, {
        json: input,
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', workspaceId] });
    },
  });
}

export function useUpdateWebhook(workspaceId: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateWebhookInput) => {
      const res = await api<Webhook>(`/workspaces/${workspaceId}/webhooks/${id}`, { json: input });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['webhook', workspaceId, id] });
    },
  });
}

export function useDeleteWebhook(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api(`/workspaces/${workspaceId}/webhooks/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', workspaceId] });
    },
  });
}
