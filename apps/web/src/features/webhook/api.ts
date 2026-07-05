import { api } from '@/lib/api';
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
  Webhook,
  WebhookWithSecret,
  WebhookDelivery,
} from '@flow-desk/shared/webhook';

// --- Webhooks ---

export async function listWebhooks(workspaceId: string): Promise<Webhook[]> {
  const res = await api<{ data: Webhook[] }>(`/workspaces/${workspaceId}/webhooks`);
  return res.data;
}

export async function getWebhook(workspaceId: string, id: string): Promise<Webhook> {
  const res = await api<Webhook>(`/workspaces/${workspaceId}/webhooks/${id}`);
  return res;
}

export async function createWebhook(
  workspaceId: string,
  input: CreateWebhookInput,
): Promise<WebhookWithSecret> {
  const res = await api<WebhookWithSecret>(`/workspaces/${workspaceId}/webhooks`, { json: input });
  return res;
}

export async function updateWebhook(
  workspaceId: string,
  id: string,
  input: UpdateWebhookInput,
): Promise<Webhook> {
  const res = await api<Webhook>(`/workspaces/${workspaceId}/webhooks/${id}`, { json: input });
  return res;
}

export async function deleteWebhook(workspaceId: string, id: string): Promise<void> {
  await api(`/workspaces/${workspaceId}/webhooks/${id}`, { method: 'DELETE' });
}

// --- Deliveries ---

export async function listWebhookDeliveries(
  workspaceId: string,
  webhookId: string,
  cursor?: string,
): Promise<{ data: WebhookDelivery[]; nextCursor: string | null }> {
  const url = cursor
    ? `/workspaces/${workspaceId}/webhooks/${webhookId}/deliveries?cursor=${encodeURIComponent(cursor)}`
    : `/workspaces/${workspaceId}/webhooks/${webhookId}/deliveries`;
  const res = await api<{ data: WebhookDelivery[]; nextCursor: string | null }>(url);
  return res;
}
