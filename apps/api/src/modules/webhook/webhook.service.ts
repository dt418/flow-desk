import { prisma } from '../../shared/lib/prisma';
import { assertMembership, assertRole } from '../../shared/lib/access';
import { NotFoundError } from '../../shared/errors';
import * as crypto from 'crypto';
import * as repo from './webhook.repository';
import type { CreateWebhookInput, UpdateWebhookInput } from '@flow-desk/shared/webhook';
import type { Webhook as PrismaWebhook } from '@flowdesk/db';

export { signWebhookPayload } from './webhook-sign';

function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

function serializeWebhook(row: PrismaWebhook) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    url: row.url,
    events: row.events,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function serializeWebhookWithSecret(row: PrismaWebhook) {
  return {
    ...serializeWebhook(row),
    secret: row.secret,
  };
}

export const webhookService = {
  async list(userId: string, workspaceId: string) {
    await assertMembership(workspaceId, userId);
    const rows = await repo.list(prisma, workspaceId);
    return rows.map(serializeWebhook);
  },

  async get(userId: string, id: string) {
    const row = await repo.findById(prisma, id);
    if (!row) throw new NotFoundError('Webhook');
    await assertMembership(row.workspaceId, userId);
    return serializeWebhook(row);
  },

  async create(userId: string, workspaceId: string, body: CreateWebhookInput) {
    await assertRole(workspaceId, userId, ['OWNER', 'ADMIN']);
    const secret = generateSecret();
    const row = await repo.create(prisma, {
      workspaceId,
      url: body.url,
      secret,
      events: body.events,
      isActive: body.isActive ?? true,
    });
    // Return with secret — one-time reveal only
    return serializeWebhookWithSecret(row);
  },

  async update(userId: string, id: string, body: UpdateWebhookInput) {
    const row = await repo.findById(prisma, id);
    if (!row) throw new NotFoundError('Webhook');
    await assertRole(row.workspaceId, userId, ['OWNER', 'ADMIN']);
    const updated = await repo.update(prisma, id, {
      ...(body.url !== undefined ? { url: body.url } : {}),
      ...(body.events !== undefined ? { events: body.events } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    });
    return serializeWebhook(updated);
  },

  async remove(userId: string, id: string) {
    const row = await repo.findById(prisma, id);
    if (!row) throw new NotFoundError('Webhook');
    await assertRole(row.workspaceId, userId, ['OWNER', 'ADMIN']);
    await repo.remove(prisma, id);
  },

  async listDeliveries(userId: string, id: string, query: { cursor?: string; limit: number }) {
    const row = await repo.findById(prisma, id);
    if (!row) throw new NotFoundError('Webhook');
    await assertMembership(row.workspaceId, userId);
    return repo.listDeliveries(prisma, id, query);
  },
};
