import { prisma } from '../../shared/lib/prisma';
import type { Prisma, IntegrationProvider } from '@flowdesk/db';

/**
 * Read/write for Integration rows.
 *
 * Soft-delete aware (prisma-extension auto-filters deletedAt:null on
 * findFirst/findMany/count/aggregate/groupBy and on findUnique for live
 * rows). Deletes here set deletedAt explicitly so disconnect-then-reconnect
 * of the same (provider, workspace, external account) is allowed.
 */
export const integrationRepository = {
  async create(data: Prisma.IntegrationUncheckedCreateInput) {
    return prisma.integration.create({ data });
  },

  async listByWorkspace(workspaceId: string) {
    return prisma.integration.findMany({
      where: { workspaceId },
      orderBy: [{ provider: 'asc' }, { createdAt: 'asc' }],
    });
  },

  async findByProviderAccount(
    provider: IntegrationProvider,
    workspaceId: string,
    externalAccountId: string,
  ) {
    // The partial unique index makes this the canonical lookup. The
    // softDeleteExtension will null this if the row is soft-deleted.
    return prisma.integration.findUnique({
      where: {
        provider_workspaceId_externalAccountId: {
          provider,
          workspaceId,
          externalAccountId,
        },
      },
    });
  },

  async softDelete(id: string) {
    return prisma.integration.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async updateTokens(
    id: string,
    patch: {
      accessTokenCipher: string;
      refreshTokenCipher?: string | null;
      accessTokenExpiresAt?: number | null;
      scopes: string[];
    },
  ) {
    return prisma.integration.update({
      where: { id },
      data: {
        accessTokenCipher: patch.accessTokenCipher,
        refreshTokenCipher: patch.refreshTokenCipher,
        accessTokenExpiresAt: patch.accessTokenExpiresAt ?? null,
        scopes: patch.scopes,
      },
    });
  },
};
